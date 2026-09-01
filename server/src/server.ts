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

    // Seed rich default demo accounts and realistic recruiter-ready conversation history
    try {
        const seedPassword = '123';

        // Check if demo users exist or create them
        const demoUsersData = [
            { username: 'armin', displayName: 'Armin (Lead)', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80' },
            { username: 'sara', displayName: 'Sara Rostami (UI/UX)', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80' },
            { username: 'echo', displayName: 'Echo AI Bot 🤖', avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80' },
            { username: 'david', displayName: 'David Chen (Tech Lead)', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80' },
            { username: 'elena', displayName: 'Elena Vance (Frontend)', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80' },
            { username: 'alex', displayName: 'Alex Rivera (DevOps)', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80' }
        ];

        const usersMap: Record<string, IUserDocument> = {};

        for (const u of demoUsersData) {
            let userDoc = await User.findOne({ username: u.username });
            if (!userDoc) {
                userDoc = new User({
                    username: u.username,
                    password: seedPassword,
                    displayName: u.displayName,
                    avatar: u.avatar,
                    lastSeen: new Date(Date.now() - Math.floor(Math.random() * 3600000))
                });
                await userDoc.save();
            }
            usersMap[u.username] = userDoc;
        }

        console.log("🌱 Demo accounts verified & seeded:", Object.keys(usersMap).join(', '));

        // Seed rich conversation history if messages collection is empty
        const messageCount = await Message.countDocuments();
        if (messageCount === 0 && usersMap['armin']) {
            const arminId = usersMap['armin']._id.toString();
            const saraId = usersMap['sara']?._id.toString();
            const echoId = usersMap['echo']?._id.toString();
            const davidId = usersMap['david']?._id.toString();
            const elenaId = usersMap['elena']?._id.toString();
            const alexId = usersMap['alex']?._id.toString();

            const now = Date.now();
            const seedMessages = [];

            // Conversation with Sara (UI/UX)
            if (saraId) {
                seedMessages.push(
                    { senderId: saraId, receiverId: arminId, content: "Hey Armin! I just reviewed the new Glassmorphism design for EchoChat. The blur effects and colors look amazing! 🔥", type: 'text', timestamp: new Date(now - 1000 * 60 * 45) },
                    { senderId: arminId, receiverId: saraId, content: "Thanks Sara! Glad you like it. I added 10 dynamic curated themes including Cyber Neon and Luxury Gold.", type: 'text', timestamp: new Date(now - 1000 * 60 * 40) },
                    { senderId: saraId, receiverId: arminId, content: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80", type: 'image', fileName: 'design_system_preview.png', timestamp: new Date(now - 1000 * 60 * 30) },
                    { senderId: saraId, receiverId: arminId, content: "Here is the mobile mockup preview we finalized yesterday. Notice the sleek responsive layout! 📱", type: 'text', timestamp: new Date(now - 1000 * 60 * 28) },
                    { senderId: arminId, receiverId: saraId, content: "Looks pixel perfect. Agora WebRTC video calling integration is also 100% active and tested.", type: 'text', timestamp: new Date(now - 1000 * 60 * 15) },
                    { senderId: saraId, receiverId: arminId, content: "Awesome! Ready for client and recruiter demonstration 🚀✨", type: 'text', timestamp: new Date(now - 1000 * 60 * 5) }
                );
            }

            // Conversation with Echo AI Bot
            if (echoId) {
                seedMessages.push(
                    { senderId: echoId, receiverId: arminId, content: "👋 Hello Armin! Welcome to EchoChat. I am your real-time testing companion bot.", type: 'text', timestamp: new Date(now - 1000 * 60 * 120) },
                    { senderId: arminId, receiverId: echoId, content: "Hey Echo, can you confirm the WebSocket latency and multimedia attachments?", type: 'text', timestamp: new Date(now - 1000 * 60 * 110) },
                    { senderId: echoId, receiverId: arminId, content: "All systems are operational! ⚡ WebSocket latency is sub-30ms, and multimedia handling supports Base64 images, voice notes, and documents.", type: 'text', timestamp: new Date(now - 1000 * 60 * 105) },
                    { senderId: echoId, receiverId: arminId, content: "Try sending a photo, voice note, or initiating an Agora video call! 📹🎙️", type: 'text', timestamp: new Date(now - 1000 * 60 * 100) }
                );
            }

            // Conversation with David Chen (Tech Lead)
            if (davidId) {
                seedMessages.push(
                    { senderId: davidId, receiverId: arminId, content: "Armin, the TypeScript architecture and state management look super clean. Great job on the JWT security middleware.", type: 'text', timestamp: new Date(now - 1000 * 60 * 200) },
                    { senderId: arminId, receiverId: davidId, content: "Thank you David! Bcrypt password hashing and sanitized payloads are protecting all REST endpoints.", type: 'text', timestamp: new Date(now - 1000 * 60 * 180) },
                    { senderId: davidId, receiverId: arminId, content: "Perfect. The zero-config in-memory database fallback makes live demonstrations completely frictionless.", type: 'text', timestamp: new Date(now - 1000 * 60 * 160) }
                );
            }

            // Conversation with Elena Vance (Frontend)
            if (elenaId) {
                seedMessages.push(
                    { senderId: elenaId, receiverId: arminId, content: "Hey Armin! The instant contact search and online presence indicators work lightning fast! ⚡", type: 'text', timestamp: new Date(now - 1000 * 60 * 300) },
                    { senderId: arminId, receiverId: elenaId, content: "Yes! Socket.io broadcasts presence updates in real time to all active sockets.", type: 'text', timestamp: new Date(now - 1000 * 60 * 280) },
                    { senderId: elenaId, receiverId: arminId, content: "The dynamic theme switcher is also one of my favorite features. Cyber Neon looks incredible in dark mode! 🌟", type: 'text', timestamp: new Date(now - 1000 * 60 * 250) }
                );
            }

            // Conversation with Alex Rivera (DevOps)
            if (alexId) {
                seedMessages.push(
                    { senderId: alexId, receiverId: arminId, content: "Hey Armin! Vercel reverse proxy and Render cloud deployment are running with 100% uptime.", type: 'text', timestamp: new Date(now - 1000 * 60 * 400) },
                    { senderId: arminId, receiverId: alexId, content: "Awesome Alex, thanks for configuring the cloud proxy routing!", type: 'text', timestamp: new Date(now - 1000 * 60 * 380) }
                );
            }

            if (seedMessages.length > 0) {
                await Message.insertMany(seedMessages);
                console.log(`💬 Seeded ${seedMessages.length} realistic conversation messages for demo!`);
            }
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

server.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🚀 EchoChat TypeScript Server running on 0.0.0.0:${PORT}`);
});
