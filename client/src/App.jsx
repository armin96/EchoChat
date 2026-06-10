import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import AgoraRTC from "agora-rtc-sdk-ng";
import EmojiPicker from 'emoji-picker-react';
import { 
  Phone, Video, Send, Paperclip, Smile, User, Moon, Sun, 
  X, LogOut, PhoneOff, Camera, Settings, Mic, Volume2, Palette, Check, MessageSquare, Clock, FileText
} from 'lucide-react';

// Socket connection and Agora configuration
const socket = io('http://localhost:3000');
const AGORA_APP_ID = "7d833f08030d4926a9f8693377e64ba8"; 
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

// 10 Diverse Themes Definition
const themes = [
  { id: 'wa-dark', name: 'WhatsApp Dark', primary: '#00a884', bg: '#0b141a', chatBg: '#0b141a', sidebar: '#111b21', header: '#202c33', bubble: '#056162', text: '#ffffff' },
  { id: 'wa-light', name: 'WhatsApp Light', primary: '#00a884', bg: '#e5ddd5', chatBg: '#e5ddd5', sidebar: '#ffffff', header: '#f0f2f5', bubble: '#dcf8c6', text: '#000000' },
  { id: 'ocean-dark', name: 'Ocean Dark', primary: '#0077b6', bg: '#001219', chatBg: '#001219', sidebar: '#001d29', header: '#002533', bubble: '#005f73', text: '#ffffff' },
  { id: 'royal-purple', name: 'Royal Purple', primary: '#7b2cbf', bg: '#10002b', chatBg: '#10002b', sidebar: '#240046', header: '#3c096c', bubble: '#5a189a', text: '#ffffff' },
  { id: 'forest', name: 'Deep Forest', primary: '#2d6a4f', bg: '#081c15', chatBg: '#081c15', sidebar: '#1b4332', header: '#2d6a4f', bubble: '#40916c', text: '#ffffff' },
  { id: 'midnight-red', name: 'Midnight Red', primary: '#e63946', bg: '#1a1a1a', chatBg: '#1a1a1a', sidebar: '#2b2b2b', header: '#333333', bubble: '#e63946', text: '#ffffff' },
  { id: 'cyberpunk', name: 'Cyber Neon', primary: '#f72585', bg: '#0b090a', chatBg: '#0b090a', sidebar: '#161a1d', header: '#a4133c', bubble: '#ff4d6d', text: '#ffffff' },
  { id: 'luxury-gold', name: 'Luxury Gold', primary: '#d4af37', bg: '#1c1c1c', chatBg: '#1c1c1c', sidebar: '#2d2d2d', header: '#3d3d3d', bubble: '#d4af37', text: '#ffffff' },
  { id: 'soft-pink', name: 'Sakura Pink', primary: '#ff85a1', bg: '#fff0f3', chatBg: '#fff0f3', sidebar: '#ffccd5', header: '#ffb3c1', bubble: '#ff85a1', text: '#4a192c' },
  { id: 'minimal-gray', name: 'Minimal Gray', primary: '#495057', bg: '#f8f9fa', chatBg: '#f8f9fa', sidebar: '#e9ecef', header: '#dee2e6', bubble: '#adb5bd', text: '#212529' }
];

export default function App() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [formData, setFormData] = useState({ username: '', password: '', displayName: '' });
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [currentTheme, setCurrentTheme] = useState(themes[0]);
  const [showSettings, setShowSettings] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState({}); 
  
  const [inCall, setInCall] = useState(false);
  const [localTracks, setLocalTracks] = useState([]);
  const [incomingCall, setIncomingCall] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [zoomedAvatar, setZoomedAvatar] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState("");

  const activeChatRef = useRef(null);
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);

  const scrollRef = useRef();
  const fileInputRef = useRef();
  const profileInputRef = useRef();
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const ringtoneRef = useRef(new Audio("https://assets.mixkit.co/active_storage/sfx/1358/1358-preview.mp3"));
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  // Initial load from LocalStorage
  useEffect(() => {
    const savedUser = localStorage.getItem('chat_user');
    if (savedUser) setUser(JSON.parse(savedUser));
    const savedThemeId = localStorage.getItem('app_theme');
    if (savedThemeId) setCurrentTheme(themes.find(t => t.id === savedThemeId) || themes[0]);
  }, []);

  // Socket event listeners
  useEffect(() => {
    if (user) {
      socket.emit('register_socket', user._id);
      socket.emit('get_all_statuses');
      fetchChats();
      socket.on('all_statuses', (data) => setOnlineUsers(data));
      socket.on('user_status_change', (data) => setOnlineUsers(prev => ({ ...prev, [data.userId]: data.status })));
      socket.on('receive_message', (data) => {
        fetchChats(); // Refresh contacts list to ensure new users appear
        const currentActive = activeChatRef.current;
        if (currentActive && (data.senderId === currentActive._id || data.receiverId === currentActive._id)) {
          setMessages(prev => {
            // Strong duplicate check
            const exists = prev.some(m => {
              if (m._id && data._id && m._id === data._id) return true;
              if (m.content === data.content) {
                const t1 = new Date(m.timestamp).getTime();
                const t2 = new Date(data.timestamp).getTime();
                if (!isNaN(t1) && !isNaN(t2) && Math.abs(t1 - t2) < 5000) return true;
              }
              return false;
            });
            if (exists) return prev;
            return [...prev, data];
          });
        }
      });
      socket.on('profile_updated', (data) => {
        setChats(prev => prev.map(c => c._id === data.userId ? { ...c, avatar: data.avatar } : c));
        setActiveChat(current => current?._id === data.userId ? { ...current, avatar: data.avatar } : current);
      });
      socket.on('incoming_call', (data) => { 
        setIncomingCall(data); 
        ringtoneRef.current.play().catch(() => {}); 
      });
      socket.on('call_accepted', async (data) => await joinRoom(data.channelName));
      socket.on('call_ended', () => closeCallLocal());
    }
    return () => {
      socket.off('all_statuses'); socket.off('user_status_change'); socket.off('receive_message');
      socket.off('profile_updated'); socket.off('incoming_call'); socket.off('call_accepted'); socket.off('call_ended');
    };
  }, [user]);

  // Handle active chat changes
  useEffect(() => { 
    if (activeChat && user) fetchMessages(activeChat._id); 
    else setMessages([]);
  }, [activeChat]);

  // Auto-scroll to bottom
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const fetchChats = async () => {
    const res = await fetch(`http://localhost:3000/my-chats/${user._id}`);
    const data = await res.json();
    setChats(data);
  };

  const fetchMessages = async (otherId) => {
    try {
      const res = await fetch(`http://localhost:3000/messages/${user._id}/${otherId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) { console.error("Error fetching history", err); }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    const res = await fetch(`http://localhost:3000/${authMode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    if (res.ok) {
      const userData = await res.json();
      setUser(userData);
      localStorage.setItem('chat_user', JSON.stringify(userData));
    }
  };

  const handleProfileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const res = await fetch('http://localhost:3000/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user._id, avatar: reader.result })
      });
      if (res.ok) {
        const updatedUser = await res.json();
        setUser(updatedUser);
        localStorage.setItem('chat_user', JSON.stringify(updatedUser));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUsernameUpdate = async () => {
    if (!newUsername.trim() || newUsername === user.username) {
      setEditingUsername(false);
      return;
    }
    const res = await fetch('http://localhost:3000/update-username', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user._id, newUsername })
    });
    if (res.ok) {
      const updatedUser = await res.json();
      setUser(updatedUser);
      localStorage.setItem('chat_user', JSON.stringify(updatedUser));
      setEditingUsername(false);
    } else {
      const errorData = await res.json();
      alert(errorData.error || "Failed to update username");
    }
  };

  const renderAvatar = (u, size = "w-10 h-10", showBadge = false) => {
    const isOnline = onlineUsers[u?._id] === "online";
    return (
      <div 
        className={`relative flex-shrink-0 ${u?.avatar ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}`}
        onClick={() => { if (u?.avatar) setZoomedAvatar(u.avatar); }}
      >
        {u?.avatar ? (
          <img src={u.avatar} alt="p" className={`${size} rounded-full object-cover`} />
        ) : (
          <div className={`${size} bg-[#00a884] rounded-full flex items-center justify-center text-white font-bold uppercase`}>
            {u?.displayName?.[0] || '?'}
          </div>
        )}
        {showBadge && isOnline && (
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
        )}
      </div>
    );
  };

  const sendMessage = (e) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || !activeChat) return;
    const msgData = { 
      senderId: user._id, 
      receiverId: activeChat._id, 
      content: newMessage, 
      type: 'text', 
      timestamp: new Date() 
    };
    socket.emit('private_message', msgData);
    setMessages(prev => [...prev, msgData]);
    setNewMessage("");
    setShowEmoji(false);
  };

  const startRecording = async () => {
    if (!activeChat) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = e => audioChunksRef.current.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const msgData = {
            senderId: user._id,
            receiverId: activeChat._id,
            content: reader.result,
            type: 'audio',
            timestamp: new Date()
          };
          socket.emit('private_message', msgData);
          setMessages(prev => [...prev, msgData]);
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
        clearInterval(recordingTimerRef.current);
        setRecordingTime(0);
      };
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch (err) {
      alert('Microphone access denied.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fileType = file.type.split('/')[0];
    const reader = new FileReader();
    reader.onloadend = () => {
      const msgData = { 
        senderId: user._id, 
        receiverId: activeChat._id, 
        content: reader.result, 
        type: fileType, 
        fileName: file.name,
        timestamp: new Date() 
      };
      socket.emit('private_message', msgData);
      setMessages(prev => [...prev, msgData]);
    };
    reader.readAsDataURL(file);
  };

  const joinRoom = async (channelName) => {
    try {
      ringtoneRef.current.pause();
      await client.join(AGORA_APP_ID, channelName, null, user._id);
      const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
      setLocalTracks([audioTrack, videoTrack]);
      setInCall(true);
      setTimeout(() => videoTrack.play(localVideoRef.current), 100);
      await client.publish([audioTrack, videoTrack]);
      client.on("user-published", async (remoteUser, mediaType) => {
        await client.subscribe(remoteUser, mediaType);
        if (mediaType === "video") remoteUser.videoTrack.play(remoteVideoRef.current);
        if (mediaType === "audio") remoteUser.audioTrack.play();
      });
    } catch (err) { console.error(err); }
  };

  const startCall = () => {
    if (!activeChat) return;
    const channelName = `call_${user._id.slice(-5)}_${activeChat._id.slice(-5)}`;
    socket.emit('make_call', { callerName: user.displayName, callerId: user._id, receiverId: activeChat._id, channelName });
    joinRoom(channelName);
  };

  const closeCallLocal = async () => {
    localTracks.forEach(t => { t.stop(); t.close(); });
    await client.leave();
    setInCall(false);
    setLocalTracks([]);
    ringtoneRef.current.pause();
    setIncomingCall(null);
  };

  // Helper to detect if a message is emoji-only
  const isOnlyEmoji = (str) => {
    const emojiRegex = /^(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])+$/g;
    return emojiRegex.test(str.replace(/\s/g, ''));
  };

  // Render content based on message type
  const renderMessageContent = (m) => {
    switch (m.type) {
      case 'image': 
        return <img src={m.content} className="rounded-lg w-full max-w-[500px] object-contain shadow-sm border border-black/10" alt="Sent Image" />;
      case 'video': 
        return <video controls className="rounded-lg w-full max-w-[500px] bg-black shadow-lg"><source src={m.content} /></video>;
      case 'audio': 
        return <audio controls className="h-10 w-full min-w-[250px]"><source src={m.content} /></audio>;
      case 'application': 
        return (
          <a href={m.content} download={m.fileName} className="flex items-center gap-3 p-3 bg-black/10 rounded-lg hover:bg-black/20 transition-all">
            <FileText size={30} className="text-white/60"/> 
            <span className="text-sm font-medium truncate max-w-[200px]">{m.fileName || 'Attachment'}</span>
          </a>
        );
      default: 
        const onlyEmoji = isOnlyEmoji(m.content);
        return (
          <p className={`${onlyEmoji ? 'text-6xl py-2' : 'text-[16px] leading-relaxed'} whitespace-pre-wrap`} dir="auto">
            {m.content}
          </p>
        );
    }
  };

  // Login/Register Screen
  if (!user) return (
    <div className="auth-screen">
      {/* Animated background orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <div className="orb orb-4" />

      {/* Floating particles */}
      {[...Array(20)].map((_, i) => (
        <div key={i} className="particle" style={{
          left: `${Math.random() * 100}%`,
          animationDelay: `${Math.random() * 8}s`,
          animationDuration: `${6 + Math.random() * 6}s`,
          width: `${2 + Math.random() * 4}px`,
          height: `${2 + Math.random() * 4}px`,
          opacity: 0.3 + Math.random() * 0.4
        }} />
      ))}

      <div className="auth-card">
        {/* Logo area */}
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="auth-logo-svg">
              <circle cx="24" cy="24" r="22" fill="url(#logoGrad)" />
              <path d="M24 12C17.373 12 12 17.373 12 24C12 26.4 12.672 28.644 13.836 30.552L12 36L17.676 34.2C19.512 35.268 21.684 35.904 24 35.904C30.627 35.904 36 30.531 36 23.904C36 17.277 30.627 12 24 12Z" fill="white" opacity="0.9"/>
              <path d="M19 22.5C19 22.5 20.5 21 22 21C23.5 21 24.5 22.5 24.5 22.5C24.5 22.5 25.5 24 27 24C28.5 24 29.5 22.5 29.5 22.5" stroke="url(#logoGrad)" strokeWidth="2" strokeLinecap="round"/>
              <defs>
                <linearGradient id="logoGrad" x1="0" y1="0" x2="48" y2="48">
                  <stop offset="0%" stopColor="#00d4aa"/>
                  <stop offset="100%" stopColor="#0088ff"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="auth-app-name">EchoChat</h1>
          <p className="auth-tagline">Connect. Chat. Echo.</p>
        </div>

        {/* Mode tabs */}
        <div className="auth-tabs">
          <button
            className={`auth-tab ${authMode === 'login' ? 'active' : ''}`}
            onClick={() => setAuthMode('login')}
          >Sign In</button>
          <button
            className={`auth-tab ${authMode === 'register' ? 'active' : ''}`}
            onClick={() => setAuthMode('register')}
          >Sign Up</button>
          <div className="auth-tab-slider" style={{ transform: authMode === 'login' ? 'translateX(0)' : 'translateX(100%)' }} />
        </div>

        {/* Form */}
        <form onSubmit={handleAuth} className="auth-form">
          {authMode === 'register' && (
            <div className="auth-field" style={{ animation: 'slideDown 0.3s ease' }}>
              <label className="auth-label">Display Name</label>
              <div className="auth-input-wrap">
                <svg className="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <input
                  type="text"
                  placeholder="Your display name"
                  className="auth-input"
                  onChange={e => setFormData({...formData, displayName: e.target.value})}
                />
              </div>
            </div>
          )}
          <div className="auth-field">
            <label className="auth-label">Username</label>
            <div className="auth-input-wrap">
              <svg className="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <input
                type="text"
                placeholder="Enter your username"
                className="auth-input"
                onChange={e => setFormData({...formData, username: e.target.value})}
              />
            </div>
          </div>
          <div className="auth-field">
            <label className="auth-label">Password</label>
            <div className="auth-input-wrap">
              <svg className="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <input
                type="password"
                placeholder="Enter your password"
                className="auth-input"
                onChange={e => setFormData({...formData, password: e.target.value})}
              />
            </div>
          </div>
          <button type="submit" className="auth-btn">
            <span>{authMode === 'login' ? 'Sign In' : 'Create Account'}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="auth-btn-icon"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </form>

        <p className="auth-switch">
          {authMode === 'login' ? "Don't have an account? " : "Already have an account? "}
          <button className="auth-switch-btn" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
            {authMode === 'login' ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 flex overflow-hidden transition-all duration-300" style={{ backgroundColor: currentTheme.bg, color: currentTheme.text }}>
      
      {/* Zoomed Avatar Overlay */}
      {zoomedAvatar && (
        <div className="fixed inset-0 bg-black/90 z-[900] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setZoomedAvatar(null)}>
          <button className="absolute top-6 right-6 text-white/70 hover:text-white transition-colors">
            <X size={32}/>
          </button>
          <img src={zoomedAvatar} alt="Zoomed" className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain animate-pulse-once" style={{ animation: 'scaleIn 0.3s ease-out forwards' }} onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 z-[600] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="p-8 rounded-3xl w-full max-w-2xl flex flex-col md:flex-row gap-8 relative shadow-2xl" style={{ backgroundColor: currentTheme.sidebar }}>
                <button onClick={() => setShowSettings(false)} className="chat-close-btn"><X size={18}/></button>
                <div className="flex-1 text-center border-r border-white/10 pr-4">
                    <h3 className="text-xl font-bold mb-6 flex items-center justify-center gap-2"><User size={18}/> Profile</h3>
                    <div className="relative w-32 h-32 mx-auto mb-4 group">
                        {renderAvatar(user, "w-full h-full text-4xl")}
                        <button onClick={() => profileInputRef.current.click()} className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all"><Camera/></button>
                        <input type="file" ref={profileInputRef} className="hidden" accept="image/*" onChange={handleProfileUpload} />
                    </div>
                    <p className="font-bold text-lg">{user.displayName}</p>
                    {editingUsername ? (
                      <div className="flex items-center justify-center gap-2 mb-6 mt-1">
                        <span className="font-mono text-white/50">@</span>
                        <input 
                          className="bg-black/20 text-white rounded px-2 py-1 outline-none font-mono w-32 border border-white/20 focus:border-white/50" 
                          value={newUsername} 
                          autoFocus
                          onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} 
                          onKeyDown={(e) => { if (e.key === 'Enter') handleUsernameUpdate(); if (e.key === 'Escape') setEditingUsername(false); }}
                        />
                        <button onClick={handleUsernameUpdate} className="text-green-500 hover:text-green-400 p-1"><Check size={18}/></button>
                        <button onClick={() => setEditingUsername(false)} className="text-red-500 hover:text-red-400 p-1"><X size={18}/></button>
                      </div>
                    ) : (
                      <p className="text-sm opacity-60 mb-6 font-mono cursor-pointer hover:opacity-100 flex justify-center items-center gap-2 transition-opacity" onClick={() => { setNewUsername(user.username); setEditingUsername(true); }}>
                        @{user.username} <span className="text-[10px] uppercase bg-white/10 px-2 py-0.5 rounded-full">Edit</span>
                      </p>
                    )}
                    <button onClick={() => { localStorage.removeItem('chat_user'); setUser(null); }} className="settings-logout-btn"><LogOut size={16}/> Logout</button>
                </div>
                <div className="flex-1 pl-4 flex flex-col overflow-hidden">
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><Palette size={18}/> Themes</h3>
                    <div className="grid grid-cols-2 gap-3 overflow-y-auto pr-2 custom-scrollbar" style={{maxHeight:'300px'}}>
                        {themes.map(t => (
                            <div key={t.id} onClick={() => { setCurrentTheme(t); localStorage.setItem('app_theme', t.id); }} className={`theme-card ${currentTheme.id === t.id ? 'active' : ''}`} style={{ backgroundColor: t.header }}>
                                <div className="theme-dots">
                                  <span style={{background:t.primary}}/>
                                  <span style={{background:t.bubble}}/>
                                  <span style={{background:t.sidebar}}/>
                                </div>
                                <span className="theme-name" style={{ color: t.text }}>{t.name}</span>
                                {currentTheme.id === t.id && <Check size={12} className="theme-check"/>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Call UI */}
      {incomingCall && !inCall && (
        <div className="fixed inset-0 bg-black/95 z-[700] flex flex-col items-center justify-center text-center">
            <div className="call-avatar-ring">
                {renderAvatar({displayName: incomingCall.callerName}, "w-full h-full text-4xl")}
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">{incomingCall.callerName}</h2>
            <p className="text-white/50 mb-8 text-sm tracking-widest uppercase">Incoming call…</p>
            <div className="flex gap-12 mt-4">
                <button onClick={() => { joinRoom(incomingCall.channelName); socket.emit('accept_call', { callerId: incomingCall.callerId, channelName: incomingCall.channelName }); setIncomingCall(null); }} className="call-btn accept"><Phone size={28}/></button>
                <button onClick={() => { socket.emit('end_call', { receiverId: incomingCall.callerId }); setIncomingCall(null); ringtoneRef.current.pause(); }} className="call-btn decline"><PhoneOff size={28}/></button>
            </div>
        </div>
      )}

      {inCall && (
        <div className="fixed inset-0 bg-black z-[800] flex items-center justify-center">
            <div ref={remoteVideoRef} className="w-full h-full object-cover"></div>
            <div ref={localVideoRef} className="absolute top-6 right-6 w-40 h-60 border-2 border-[#00d4aa] rounded-2xl overflow-hidden z-10 shadow-2xl"></div>
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20"><button onClick={() => { socket.emit('end_call', { receiverId: activeChat?._id }); closeCallLocal(); }} className="call-btn decline"><PhoneOff size={28}/></button></div>
        </div>
      )}

      {/* ═══ SIDEBAR ═══ */}
      <div className="chat-sidebar" style={{ backgroundColor: currentTheme.sidebar }}>
        {/* Sidebar Header */}
        <div className="chat-sidebar-header" style={{ backgroundColor: currentTheme.header }}>
          <div className="chat-sidebar-brand">
            <div className="chat-brand-logo">
              <svg viewBox="0 0 24 24" fill="none" style={{width:20,height:20}}>
                <circle cx="12" cy="12" r="10" fill="url(#sideGrad)"/>
                <path d="M8 12c0 0 1 1.5 2 1.5S12 12 12 12s1 1.5 2 1.5 2-1.5 2-1.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                <defs><linearGradient id="sideGrad" x1="0" y1="0" x2="24" y2="24"><stop stopColor="#00d4aa"/><stop offset="1" stopColor="#0088ff"/></linearGradient></defs>
              </svg>
            </div>
            <span className="chat-brand-name">EchoChat</span>
          </div>
          <div className="chat-sidebar-actions">
            <button className="chat-icon-btn" onClick={() => setShowSettings(true)} title="Settings"><Settings size={17}/></button>
            <button className="chat-icon-btn" onClick={() => setShowSettings(true)} title="Themes"><Palette size={17}/></button>
            <div className="cursor-pointer" onClick={() => setShowSettings(true)}>{renderAvatar(user)}</div>
          </div>
        </div>

        {/* Search bar */}
        <div className="chat-search-wrap">
          <div className="chat-search" style={{ backgroundColor: currentTheme.chatBg }}>
            <svg className="chat-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input 
              className="chat-search-input" 
              placeholder="Search by name or @id…" 
              style={{ color: currentTheme.text, backgroundColor: 'transparent' }} 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Contacts list */}
        <div className="chat-contacts custom-scrollbar">
          {chats.filter(c => 
            (c.displayName && c.displayName.toLowerCase().includes(searchQuery.toLowerCase())) || 
            (c.username && c.username.toLowerCase().includes(searchQuery.toLowerCase()))
          ).map(c => {
            const isActive = activeChat?._id === c._id;
            const isOnline = onlineUsers[c._id] === "online";
            return (
              <div
                key={c._id}
                onClick={() => setActiveChat(c)}
                className={`chat-contact-item ${isActive ? 'active' : ''}`}
              >
                {isActive && <div className="chat-contact-bar" style={{background: currentTheme.primary}}/>}
                <div className="relative flex-shrink-0">
                  {renderAvatar(c, "w-12 h-12", true)}
                </div>
                <div className="chat-contact-info">
                  <div className="chat-contact-name" style={{color: currentTheme.text}}>
                    {c.displayName}
                    <span className="text-xs opacity-50 ml-2 font-mono hidden md:inline">@{c.username}</span>
                  </div>
                  <div className={`chat-contact-status ${isOnline ? 'online' : ''}`}>
                    <span className="status-dot"/>
                    {isOnline ? 'Online' : 'Offline'}
                  </div>
                </div>
                {isActive && <div className="chat-contact-active-indicator" style={{background: currentTheme.primary}}/>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ MAIN CHAT AREA ═══ */}
      <div className="chat-main" style={{ backgroundColor: currentTheme.chatBg }}>
        {activeChat ? (
          <>
            {/* Chat Header */}
            <div className="chat-header" style={{ backgroundColor: currentTheme.header }}>
              <div className="chat-header-left">
                {renderAvatar(activeChat, "w-10 h-10", true)}
                <div className="chat-header-info">
                  <div className="chat-header-name" style={{color: currentTheme.text}}>{activeChat.displayName}</div>
                  <div className={`chat-header-status ${onlineUsers[activeChat._id] === "online" ? 'online' : ''}`}>
                    <span className="status-dot"/>
                    {onlineUsers[activeChat._id] === "online" ? "Active now" : "Offline"}
                  </div>
                </div>
              </div>
              <div className="chat-header-actions">
                <button className="chat-header-btn" onClick={startCall} title="Voice call" style={{color: currentTheme.text}}><Phone size={18}/></button>
                <button className="chat-header-btn" onClick={startCall} title="Video call" style={{color: currentTheme.text}}><Video size={18}/></button>
              </div>
            </div>

            {/* Messages */}
            <div className="chat-messages custom-scrollbar">
              <div className="chat-messages-inner">
                {messages.map((m, i) => {
                  const isMine = m.senderId === user._id;
                  const onlyEmoji = m.type === 'text' && isOnlyEmoji(m.content);
                  return (
                    <div key={i} className={`chat-msg-row ${isMine ? 'mine' : 'theirs'}`}>
                      {!isMine && <div className="chat-msg-avatar">{renderAvatar(activeChat, "w-7 h-7")}</div>}
                      <div
                        className={`chat-bubble ${isMine ? 'mine' : 'theirs'} ${onlyEmoji ? 'emoji-only' : ''}`}
                        style={onlyEmoji ? {} : {
                          background: isMine
                            ? `linear-gradient(135deg, ${currentTheme.bubble} 0%, ${currentTheme.primary}dd 100%)`
                            : currentTheme.header,
                          color: currentTheme.text
                        }}
                      >
                        {renderMessageContent(m)}
                        {!onlyEmoji && (
                          <div className="bubble-meta">
                            <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            {isMine && <Check size={12} style={{color:'rgba(255,255,255,0.6)'}}/>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={scrollRef}/>
              </div>
            </div>

            {/* Input Bar */}
            <div className="chat-input-bar" style={{ backgroundColor: currentTheme.header }}>
              {showEmoji && (
                <div className="chat-emoji-picker">
                  <EmojiPicker onEmojiClick={(e) => setNewMessage(p => p + e.emoji)} theme="dark"/>
                </div>
              )}

              {isRecording ? (
                /* Recording mode */
                <div className="chat-recording-bar">
                  <div className="chat-recording-dot"/>
                  <span className="chat-recording-label">Recording…</span>
                  <span className="chat-recording-time">
                    {String(Math.floor(recordingTime / 60)).padStart(2, '0')}:{String(recordingTime % 60).padStart(2, '0')}
                  </span>
                  <button className="chat-icon-btn" onClick={() => { stopRecording(); setIsRecording(false); }} style={{color:'rgba(255,255,255,0.4)',marginLeft:'auto'}}>
                    <X size={18}/>
                  </button>
                  <button className="chat-send-btn" onClick={stopRecording} style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)', width:44, height:44 }}>
                    <svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18}><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                  </button>
                </div>
              ) : (
                /* Normal mode */
                <>
                  <button className="chat-icon-btn emoji-toggle" onClick={() => setShowEmoji(!showEmoji)}><Smile size={22}/></button>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*,audio/*,.pdf" onChange={handleFileUpload}/>
                  <button className="chat-icon-btn" onClick={() => fileInputRef.current.click()}><Paperclip size={20}/></button>
                  <form onSubmit={sendMessage} className="chat-input-form">
                    <input
                      value={newMessage}
                      onChange={e => setNewMessage(e.target.value)}
                      placeholder="Type a message…"
                      className="chat-input"
                      style={{ backgroundColor: currentTheme.chatBg, color: currentTheme.text }}
                    />
                    {newMessage.trim() ? (
                      <button type="submit" className="chat-send-btn" style={{ background: `linear-gradient(135deg, ${currentTheme.primary}, #0088ff)` }}>
                        <Send size={19}/>
                      </button>
                    ) : (
                      <button type="button" className="chat-send-btn" onClick={startRecording} style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
                        <Mic size={19}/>
                      </button>
                    )}
                  </form>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="chat-empty-state">
            <div className="chat-empty-orb"/>
            <div className="chat-empty-icon">
              <MessageSquare size={48} style={{opacity:0.6}}/>
            </div>
            <h2 className="chat-empty-title">Welcome to EchoChat</h2>
            <p className="chat-empty-sub">Select a conversation to start chatting</p>
            <div className="chat-empty-dots"><span/><span/><span/></div>
          </div>
        )}
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.15); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.35); }
      `}</style>
    </div>
  );
}