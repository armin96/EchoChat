import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import mongoose, { Document, Schema, Model } from 'mongoose';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const app = express();
app.use(cors());

// Increase payload limit for Base64 multimedia (images/videos/attachments)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Enforce JWT_SECRET best practices
let JWT_SECRET: string = process.env.JWT_SECRET || '';
if (!JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
        console.error("❌ FATAL: JWT_SECRET environment variable is missing in production.");
        process.exit(1);
    } else {
        console.warn("⚠️ [Security Notice]: JWT_SECRET is not set in .env. Using ephemeral cryptographically secure secret for development.");
        JWT_SECRET = crypto.randomBytes(64).toString('hex');
    }
}
const PORT = process.env.PORT || 3000;

// ==========================================
// 1. Mongoose Interfaces & Schemas
// ==========================================

export interface IUserDocument extends Document {
    _id: mongoose.Types.ObjectId;
    username: string;
    password: string;
    displayName: string;
    avatar: string;
    lastSeen: Date;
    createdAt: Date;
    updatedAt: Date;
    comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUserDocument>({
    username: {
        type: String,
        unique: true,
        required: true,
        trim: true,
        lowercase: true,
        minlength: [3, 'Username must be at least 3 characters long']
    },
    password: {
        type: String,
        required: true
    },
    displayName: {
        type: String,
        default: ''
    },
    avatar: {
        type: String,
        default: ''
    },
    lastSeen: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Pre-save hook: Hash password with bcrypt before saving
userSchema.pre<IUserDocument>('save', async function (next) {
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (err: any) {
        next(err);
    }
});

// Instance method: Secure password comparison
userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
    return bcrypt.compare(candidatePassword, this.password);
};

const User: Model<IUserDocument> = mongoose.model<IUserDocument>('User', userSchema);

export interface IMessageDocument extends Document {
    senderId: string;
    receiverId: string;
    content: string;
    type: 'text' | 'image' | 'video' | 'audio' | 'application';
    fileName: string;
    timestamp: Date;
}

const messageSchema = new Schema<IMessageDocument>({
    senderId: {
        type: String,
        required: true,
        index: true
    },
    receiverId: {
        type: String,
        required: true,
        index: true
    },
    content: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['text', 'image', 'video', 'audio', 'application'],
        default: 'text'
    },
    fileName: {
        type: String,
        default: ''
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
});

const Message: Model<IMessageDocument> = mongoose.model<IMessageDocument>('Message', messageSchema);

// ==========================================
// 2. Authentication Helpers & Middleware
// ==========================================

export interface AuthenticatedRequest extends Request {
    user?: any;
}

const generateToken = (user: IUserDocument): string => {
    return jwt.sign(
        { id: user._id, username: user.username },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
};

const sanitizeUser = (user: IUserDocument) => ({
    _id: user._id,
    username: user.username,
    displayName: user.displayName || user.username,
    avatar: user.avatar || '',
    lastSeen: user.lastSeen
});

const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <TOKEN>

    if (!token) {
        return res.status(401).json({ error: 'Access token required.' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token.' });
        }
        req.user = decoded;
        next();
    });
};

// ==========================================
// 3. Database Connection (Atlas -> Local -> In-Memory Fallback)
// ==========================================

const connectDatabase = async (): Promise<void> => {
    const configuredUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/echochat";

    try {
        await mongoose.connect(configuredUri, { serverSelectionTimeoutMS: 2500 });
        const dbType = configuredUri.includes('mongodb+srv') ? 'MongoDB Atlas (Cloud)' : 'Local MongoDB';
        console.log(`✅ Connected to ${dbType}`);
    } catch (connectionErr) {
        console.warn(`⚠️ Failed to connect to ${configuredUri}. Falling back to In-Memory MongoDB...`);
        try {
            const { MongoMemoryServer } = require('mongodb-memory-server');
            const mongod = await MongoMemoryServer.create();
            const memoryUri = mongod.getUri();
            await mongoose.connect(memoryUri);
            console.log(`✅ Zero-Config: Connected to In-Memory MongoDB (${memoryUri})`);
        } catch (memErr) {
            console.error("❌ Critical database failure:", memErr);
            process.exit(1);
        }
    }

    // Seed default demo accounts if database is empty
    try {
        const count = await User.countDocuments();
        if (count === 0) {
            const seedPassword = '123';
            const user1 = new User({ username: 'armin', password: seedPassword, displayName: 'Armin', avatar: '' });
            const user2 = new User({ username: 'echo', password: seedPassword, displayName: 'Echo Bot', avatar: '' });
            await user1.save();
            await user2.save();
            console.log("🌱 Default demo users seeded: armin (password: 123), echo (password: 123)");
        }
    } catch (seedErr) {
        console.error("❌ Database seeding error:", seedErr);
    }
};

connectDatabase();

// ==========================================
// 4. REST API Routes
// ==========================================

// Health check endpoint
app.get('/', (req: Request, res: Response) => {
    res.json({
        status: 'healthy',
        name: 'EchoChat TypeScript API',
        version: '1.0.0',
        timestamp: new Date()
    });
});

// User Registration
app.post('/register', async (req: Request, res: Response) => {
    try {
        const { username, password, displayName } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }

        const normalizedUsername = username.trim().toLowerCase();
        const existingUser = await User.findOne({ username: normalizedUsername });
        if (existingUser) {
            return res.status(400).json({ error: 'Username already taken.' });
        }

        const newUser = new User({
            username: normalizedUsername,
            password,
            displayName: displayName ? displayName.trim() : normalizedUsername,
            avatar: ''
        });

        await newUser.save();
        const token = generateToken(newUser);

        return res.status(201).json({
            token,
            user: sanitizeUser(newUser)
        });
    } catch (err) {
        console.error('Registration error:', err);
        return res.status(500).json({ error: 'Failed to register user.' });
    }
});

// User Login
app.post('/login', async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }

        const normalizedUsername = username.trim().toLowerCase();
        const user = await User.findOne({ username: normalizedUsername });
        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        const token = generateToken(user);
        return res.json({
            token,
            user: sanitizeUser(user)
        });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Authentication failed.' });
    }
});

// Get user contacts / conversation list
app.get('/my-chats/:userId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const users = await User.find({ _id: { $ne: req.params.userId } })
            .select('-password')
            .sort({ lastSeen: -1 });
        return res.json(users);
    } catch (err) {
        console.error('Fetch chats error:', err);
        return res.status(500).json({ error: 'Failed to fetch contacts.' });
    }
});

// Get direct messages between two users
app.get('/messages/:userId/:otherId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    const { userId, otherId } = req.params;
    try {
        const messages = await Message.find({
            $or: [
                { senderId: userId, receiverId: otherId },
                { senderId: otherId, receiverId: userId }
            ]
        }).sort({ timestamp: 1 });

        return res.json(messages);
    } catch (err) {
        console.error('Fetch messages error:', err);
        return res.json([]);
    }
});

// Update profile avatar
app.post('/update-profile', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { userId, avatar } = req.body;
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { avatar },
            { new: true }
        ).select('-password');

        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found.' });
        }

        io.emit('profile_updated', {
            userId: updatedUser._id,
            avatar: updatedUser.avatar
        });

        return res.json(updatedUser);
    } catch (err) {
        console.error('Profile update error:', err);
        return res.status(500).json({ error: 'Failed to update profile.' });
    }
});

// Update username
app.post('/update-username', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { userId, newUsername } = req.body;
        if (!newUsername || newUsername.trim().length < 3) {
            return res.status(400).json({ error: 'Username must be at least 3 characters long.' });
        }

        const normalizedUsername = newUsername.trim().toLowerCase();
        const existing = await User.findOne({ username: normalizedUsername });
        if (existing && existing._id.toString() !== userId) {
            return res.status(400).json({ error: 'Username already taken.' });
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { username: normalizedUsername },
            { new: true }
        ).select('-password');

        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found.' });
        }

        io.emit('profile_updated', {
            userId: updatedUser._id,
            avatar: updatedUser.avatar,
            username: updatedUser.username
        });

        return res.json(updatedUser);
    } catch (err) {
        console.error('Username update error:', err);
        return res.status(500).json({ error: 'Failed to update username.' });
    }
});

// ==========================================
// 5. Socket.io Real-Time Signaling & Chat
// ==========================================

const userSockets: Record<string, string> = {};  // Map userId -> socket.id
const lastSeenData: Record<string, string | Date> = {}; // Map userId -> 'online' | Date

io.on('connection', (socket: Socket) => {

    // Register active user socket session
    socket.on('register_socket', (userId: string) => {
        userSockets[userId] = socket.id;
        lastSeenData[userId] = "online";
        io.emit('user_status_change', { userId, status: "online" });
    });

    // Broadcast online status catalog
    socket.on('get_all_statuses', () => {
        socket.emit('all_statuses', lastSeenData);
    });

    // Handle private instant messages
    socket.on('private_message', async (data: any) => {
        try {
            const newMessage = new Message({
                senderId: data.senderId,
                receiverId: data.receiverId,
                content: data.content,
                type: data.type || 'text',
                fileName: data.fileName || '',
                timestamp: new Date()
            });

            const savedMessage = await newMessage.save();
            const receiverSocketId = userSockets[data.receiverId];
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('receive_message', savedMessage);
            }
        } catch (error) {
            console.error("Socket private_message error:", error);
        }
    });

    // WebRTC / Agora RTC Call Invitations
    socket.on('make_call', (data: { receiverId: string; callerId: string; callerName: string; channelName: string }) => {
        const receiverSocketId = userSockets[data.receiverId];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('incoming_call', {
                callerName: data.callerName,
                callerId: data.callerId,
                channelName: data.channelName
            });
            console.log(`📞 Outgoing call: ${data.callerId} → ${data.receiverId}`);
        } else {
            socket.emit('call_rejected', { reason: 'User is currently offline' });
        }
    });

    // Call Acceptance
    socket.on('accept_call', (data: { callerId: string; channelName: string }) => {
        const callerSocketId = userSockets[data.callerId];
        if (callerSocketId) {
            io.to(callerSocketId).emit('call_accepted', { channelName: data.channelName });
        }
    });

    // Call Termination / Rejection
    socket.on('end_call', (data: { receiverId: string }) => {
        const receiverSocketId = userSockets[data.receiverId];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('call_ended');
        }
    });

    // Handle Client Disconnect
    socket.on('disconnect', () => {
        const userId = Object.keys(userSockets).find(key => userSockets[key] === socket.id);
        if (userId) {
            const now = new Date();
            lastSeenData[userId] = now;
            delete userSockets[userId];
            io.emit('user_status_change', { userId, status: now });
        }
    });
});

server.listen(PORT, () => {
    console.log(`🚀 EchoChat TypeScript Server running on port ${PORT}`);
});
