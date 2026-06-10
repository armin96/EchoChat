const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
// افزایش محدودیت حجم برای دریافت تصاویر و ویدیوهای Base64
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const server = http.createServer(app);
app.get('/', (req, res) => res.json({ status: 'ok', message: 'EchoChat server is running' }));
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const mongoURI = "mongodb://127.0.0.1:27017/echochat";

// مدل کاربر
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    displayName: String,
    avatar: String,
    lastSeen: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// مدل پیام
const messageSchema = new mongoose.Schema({
    senderId: String,
    receiverId: String,
    content: String, // این فیلد شامل متن یا رشته Base64 عکس/فیلم است
    type: { type: String, default: 'text' },
    timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

mongoose.connect(mongoURI)
    .then(async () => {
        console.log("✅ Connected to MongoDB Atlas");
        try {
            const count = await User.countDocuments();
            if (count === 0) {
                const testUsers = [
                    { username: 'armin', password: '123', displayName: 'Armin', avatar: '' },
                    { username: 'echo', password: '123', displayName: 'Echo Bot', avatar: '' }
                ];
                await User.insertMany(testUsers);
                console.log("🌱 Default test users seeded successfully!");
            }
        } catch (e) {
            console.error("❌ Seeding error:", e);
        }
    })
    .catch(err => console.error("❌ Connection error:", err));

const userSockets = {};  
const lastSeenData = {}; 

// مسیرهای API
app.post('/register', async (req, res) => {
    try {
        const { username, password, displayName } = req.body;
        const user = new User({ username, password, displayName, avatar: '' });
        await user.save();
        res.json(user);
    } catch (err) { res.status(400).send("Error"); }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    if (user) res.json(user);
    else res.status(401).send("Error");
});

app.get('/my-chats/:userId', async (req, res) => {
    const users = await User.find({ _id: { $ne: req.params.userId } });
    res.json(users);
});

app.get('/messages/:userId/:otherId', async (req, res) => {
    const { userId, otherId } = req.params;
    try {
        const messages = await Message.find({
            $or: [
                { senderId: userId, receiverId: otherId },
                { senderId: otherId, receiverId: userId }
            ]
        }).sort({ timestamp: 1 });
        res.json(messages);
    } catch (err) { res.json([]); }
});

app.post('/update-profile', async (req, res) => {
    try {
        const { userId, avatar } = req.body;
        const updatedUser = await User.findByIdAndUpdate(userId, { avatar }, { new: true });
        // Emit to all connected clients that profile was updated
        io.emit('profile_updated', { userId: updatedUser._id, avatar: updatedUser.avatar });
        res.json(updatedUser);
    } catch (err) {
        res.status(500).json({ error: "Failed to update profile" });
    }
});

app.post('/update-username', async (req, res) => {
    try {
        const { userId, newUsername } = req.body;
        // Check if username is already taken
        const existing = await User.findOne({ username: newUsername });
        if (existing) {
            return res.status(400).json({ error: "Username already taken." });
        }
        const updatedUser = await User.findByIdAndUpdate(userId, { username: newUsername }, { new: true });
        io.emit('profile_updated', { userId: updatedUser._id, avatar: updatedUser.avatar, username: updatedUser.username });
        res.json(updatedUser);
    } catch (err) {
        res.status(500).json({ error: "Failed to update username" });
    }
});

// سوکت (Socket.io)
io.on('connection', (socket) => {

    // ثبت سوکت کاربر
    socket.on('register_socket', (userId) => {
        userSockets[userId] = socket.id;
        lastSeenData[userId] = "online";
        io.emit('user_status_change', { userId, status: "online" });
    });

    // ارسال وضعیت همه کاربران
    socket.on('get_all_statuses', () => {
        socket.emit('all_statuses', lastSeenData);
    });

    // ارسال پیام خصوصی
    socket.on('private_message', async (data) => {
        try {
            const newMessage = new Message({
                senderId: data.senderId,
                receiverId: data.receiverId,
                content: data.content,
                type: data.type || 'text',
                timestamp: new Date()
            });
            const savedMessage = await newMessage.save();
            const receiverSocketId = userSockets[data.receiverId];
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('receive_message', savedMessage);
            }
        } catch (error) {
            console.error("Socket Error:", error);
        }
    });

    // 📞 شروع تماس ویدیویی
    socket.on('make_call', (data) => {
        const receiverSocketId = userSockets[data.receiverId];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('incoming_call', {
                callerName: data.callerName,
                callerId:   data.callerId,
                channelName: data.channelName
            });
            console.log(`📞 Call from ${data.callerId} → ${data.receiverId}`);
        } else {
            // گیرنده آفلاینه
            socket.emit('call_rejected', { reason: 'User is offline' });
        }
    });

    // ✅ قبول تماس
    socket.on('accept_call', (data) => {
        const callerSocketId = userSockets[data.callerId];
        if (callerSocketId) {
            io.to(callerSocketId).emit('call_accepted', { channelName: data.channelName });
        }
    });

    // ❌ پایان / رد تماس
    socket.on('end_call', (data) => {
        const receiverSocketId = userSockets[data.receiverId];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('call_ended');
        }
    });

    // قطع اتصال
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

// استفاده از '0.0.0.0' برای دسترسی گوشی به سرور
server.listen(3000, '0.0.0.0', () => console.log(`🚀 Server running on 3000`));
