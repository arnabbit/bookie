require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const connectDB = require('./config/database');
const Message = require('./models/Message');
const Conversation = require('./models/Conversation');
const User = require('./models/User');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const bookRoutes = require('./routes/books');
const friendRoutes = require('./routes/friends');
const chatRoutes = require('./routes/chat');
const commentRoutes = require('./routes/comments');

const app = express();
const server = http.createServer(app);

// CORS
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:8081',
  credentials: true,
}));
app.use(express.json());

// Static files (auth callback page)
app.use(express.static('public'));

// Connect to MongoDB
connectDB();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/chat', chatRoutes);

// Socket.io for real-time chat
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:8081',
    credentials: true,
  },
});

// Track online users
const onlineUsers = new Map();

io.on('connection', (socket) => {
  // Authenticate socket connection via token
  const token = socket.handshake.auth.token;
  const jwt = require('jsonwebtoken');
  let userId = null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId = decoded.id;
    onlineUsers.set(userId, socket.id);

    // Update user online status
    User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() });

    // Broadcast online status
    socket.broadcast.emit('user-online', userId);
  } catch {
    console.log('Socket: unauthenticated connection attempt');
  }

  // Join a conversation room
  socket.on('join-conversation', (conversationId) => {
    socket.join(conversationId);
  });

  // Leave a conversation room
  socket.on('leave-conversation', (conversationId) => {
    socket.leave(conversationId);
  });

  // Send a message
  socket.on('send-message', async ({ conversationId, content, type = 'text', sharedBookPage = null }) => {
    if (!userId) return;

    try {
      const message = await Message.create({
        conversation: conversationId,
        sender: userId,
        type,
        content,
        sharedBookPage,
      });

      // Update conversation preview
      const preview = type === 'text' ? content : '[Shared a book page]';
      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: message._id,
        lastMessagePreview: preview,
        updatedAt: new Date(),
      });

      const populatedMessage = await Message.findById(message._id)
        .populate('sender', 'username avatar');

      // Broadcast to others in the conversation
      socket.to(conversationId).emit('new-message', populatedMessage);
    } catch (err) {
      console.error('Socket send-message error:', err.message);
    }
  });

  // Typing indicator
  socket.on('typing', ({ conversationId }) => {
    socket.to(conversationId).emit('user-typing', { userId });
  });

  socket.on('stop-typing', ({ conversationId }) => {
    socket.to(conversationId).emit('user-stop-typing', { userId });
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (userId) {
      onlineUsers.delete(userId);
      User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
      io.emit('user-offline', userId);
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
