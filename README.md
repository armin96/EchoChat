# 📱 EchoChat - Full-Stack Real-Time Messaging & Calling Platform

![EchoChat Banner](https://github.com/user-attachments/assets/8494d55f-6ad6-4c10-89c6-0bd674f1aec9)

<p align="center">
  <strong>A modern, high-performance real-time messaging and WebRTC video calling platform built with React, Node.js, Socket.io, and Agora SDK.</strong>
</p>

<p align="center">
  <a href="https://echo-chat-navy.vercel.app/" target="_blank">
    <img src="https://img.shields.io/badge/🚀_Live_Demo-View_EchoChat-0070F3?style=for-the-badge&logo=vercel&logoColor=white" alt="Live Demo" />
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Vite-7.2-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4.1-38B2AC?logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express-4.18-000000?logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/Socket.io-4.6-010101?logo=socket.io&logoColor=white" alt="Socket.io" />
  <img src="https://img.shields.io/badge/WebRTC-Agora_RTC-099CEC?logo=webrtc&logoColor=white" alt="Agora WebRTC" />
  <img src="https://img.shields.io/badge/MongoDB-Atlas_%26_In--Memory-47A248?logo=mongodb&logoColor=white" alt="MongoDB" />
  <img src="https://img.shields.io/badge/Security-bcrypt_%2B_JWT-critical" alt="Security" />
</p>

---

## 🚀 Key Features

### 1. 💬 Real-Time Messaging & Presence
- **Bidirectional WebSockets**: Sub-100ms message delivery powered by Socket.io.
- **Live User Presence**: Instant online/offline status indicators and real-time tracking.
- **Optimistic UI Updates**: Immediate client-side rendering with automatic synchronization.

### 2. 📹 Live Video & Audio Calls
- **WebRTC Integration**: High-definition, low-latency audio/video calling powered by **Agora RTC SDK**.
- **Real-Time Signaling**: Custom WebSocket signaling for call invites, ringtone playback, acceptance, and graceful termination.
- **Picture-in-Picture & Responsive Call UI**: Mobile-friendly video feeds with camera/microphone stream management.

### 3. 🔒 Production-Grade Security & Authentication
- **Bcrypt Password Hashing**: Passwords are salted and hashed (10 rounds) before persistence — zero plaintext exposure.
- **JWT (JSON Web Tokens)**: Stateless token-based authentication protecting REST endpoints.
- **Sanitized Payloads**: Sensitive attributes are stripped from API responses.

### 4. 📎 Smart Multimedia & Attachments
- **Image Lightbox**: Compact in-chat previews with high-resolution fullscreen modal viewer and one-click download.
- **Voice Notes & Audio**: Built-in voice recording with animated timer and inline audio player.
- **Files & Videos**: Support for document attachments (PDF), video playback, and regex-powered large emoji rendering.

### 5. 🎨 Dynamic Theme Engine & Full Responsiveness
- **10+ Curated Themes**: Instant theme switching (Cyber Neon, Luxury Gold, Royal Purple, Deep Forest, WhatsApp Dark/Light, etc.).
- **Mobile-First Responsive Design**: Adaptive layout supporting mobile screens, tablets, and wide desktops with mobile back navigation.
- **Local Persistence**: User sessions and theme preferences automatically cached in `localStorage`.

---

## 🛠 Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, Vite, Tailwind CSS v4, Lucide Icons, Emoji Picker |
| **Backend** | Node.js, Express.js, Socket.io |
| **Real-Time & Calls** | WebSockets (Socket.io), WebRTC (Agora RTC SDK) |
| **Database** | MongoDB Atlas (Cloud), Local MongoDB, Zero-Config In-Memory MongoDB Fallback |
| **Auth & Security** | JSON Web Tokens (`jsonwebtoken`), Bcrypt (`bcryptjs`), CORS |

---

## ⚙️ Quick Start Guide

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 1. Clone the Repository
```bash
git clone https://github.com/armin96/EchoChat.git
cd EchoChat
```

### 2. Install & Start Backend Server
```bash
cd server
npm install
npm start
```
> 💡 **Zero-Config Database**: If no local or cloud MongoDB is detected, the server automatically boots an in-memory database (`mongodb-memory-server`) with pre-seeded demo accounts.

**Default Pre-Seeded Accounts:**
- `Username`: `armin` | `Password`: `123`
- `Username`: `echo` | `Password`: `123`

### 3. Install & Start Frontend Client
In a new terminal window:
```bash
cd client
npm install
npm run dev
```

Visit **`http://localhost:5173`** in your browser.

---

## 🔧 Environment Variables (Optional)

You can customize server settings by creating a `server/.env` file (see `server/.env.example`):

```env
# Server Port (Default: 3000)
PORT=3000

# JWT Secret Key
JWT_SECRET=your_super_secret_jwt_key_here

# MongoDB Connection String (Atlas Cloud or Local)
# Leave commented out or empty to use automatic In-Memory database
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/echochat?retryWrites=true&w=majority
```

---

## 📡 REST API Documentation

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| `POST` | `/register` | No | Register a new user and receive JWT token |
| `POST` | `/login` | No | Authenticate user and receive JWT token |
| `GET` | `/my-chats/:userId` | **Yes (Bearer JWT)** | Fetch contacts and user list |
| `GET` | `/messages/:userId/:otherId` | **Yes (Bearer JWT)** | Retrieve message history between two users |
| `POST` | `/update-profile` | **Yes (Bearer JWT)** | Update user profile avatar |
| `POST` | `/update-username` | **Yes (Bearer JWT)** | Change username with uniqueness check |

---

## 👥 Real-Time WebSocket Events

| Event | Direction | Description |
|---|---|---|
| `register_socket` | Client → Server | Registers active user socket session |
| `get_all_statuses` | Client → Server | Requests online status catalog |
| `private_message` | Client → Server | Sends instant message / media to recipient |
| `receive_message` | Server → Client | Delivers incoming message in real-time |
| `make_call` | Client → Server | Initiates WebRTC / Agora video/voice call invitation |
| `accept_call` | Client → Server | Confirms and joins active call channel |
| `end_call` | Client → Server | Terminates active call session |

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
