const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const express = require('express');
const User = require('../src/models/User');
const Conversation = require('../src/models/Conversation');
const Message = require('../src/models/Message');
const chatRoutes = require('../src/routes/chat');

const app = express();
app.use(express.json());
app.use('/api/chat', chatRoutes);

const generateToken = (user) =>
  jwt.sign({ id: user._id, username: user.username, email: user.email }, process.env.JWT_SECRET);

describe('Chat Routes', () => {
  let tokenA, tokenB, userA, userB;

  beforeEach(async () => {
    userA = await User.create({ username: 'alice', email: 'alice@test.com', isUsernameSet: true });
    userB = await User.create({ username: 'bob', email: 'bob@test.com', isUsernameSet: true });
    tokenA = generateToken(userA);
    tokenB = generateToken(userB);
  });

  // --- POST /api/chat/conversation/with/:userId ---
  describe('POST /api/chat/conversation/with/:userId', () => {
    test('creates new conversation', async () => {
      const res = await request(app)
        .post(`/api/chat/conversation/with/${userB._id}`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      expect(res.body.participants).toHaveLength(2);
    });

    test('returns existing conversation on second call', async () => {
      const first = await request(app)
        .post(`/api/chat/conversation/with/${userB._id}`)
        .set('Authorization', `Bearer ${tokenA}`);
      const second = await request(app)
        .post(`/api/chat/conversation/with/${userB._id}`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(first.body._id).toBe(second.body._id);
    });

    test('conversation accessible from either side', async () => {
      await request(app)
        .post(`/api/chat/conversation/with/${userB._id}`)
        .set('Authorization', `Bearer ${tokenA}`);
      const res = await request(app)
        .post(`/api/chat/conversation/with/${userA._id}`)
        .set('Authorization', `Bearer ${tokenB}`);
      expect(res.status).toBe(200);
    });

    test('requires auth', async () => {
      const res = await request(app).post(`/api/chat/conversation/with/${userB._id}`);
      expect(res.status).toBe(401);
    });
  });

  // --- GET /api/chat/conversations ---
  describe('GET /api/chat/conversations', () => {
    test('returns conversations for user', async () => {
      await Conversation.create({
        participants: [userA._id, userB._id],
        lastMessagePreview: 'Hello bob!',
      });
      const res = await request(app).get('/api/chat/conversations').set('Authorization', `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    test('sorted by updatedAt descending', async () => {
      await Conversation.create([
        { participants: [userA._id, userB._id], updatedAt: new Date('2025-01-01'), lastMessagePreview: 'old' },
        { participants: [userA._id, userB._id], updatedAt: new Date('2025-06-01'), lastMessagePreview: 'new' },
      ]);
      const res = await request(app).get('/api/chat/conversations').set('Authorization', `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].lastMessagePreview).toBe('new');
    });

    test('empty when no conversations', async () => {
      const res = await request(app).get('/api/chat/conversations').set('Authorization', `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });
  });

  // --- GET /api/chat/conversations/:id/messages ---
  describe('GET /api/chat/conversations/:id/messages', () => {
    let conversationId;

    beforeEach(async () => {
      const conv = await Conversation.create({ participants: [userA._id, userB._id] });
      conversationId = conv._id;

      // Create messages with explicit timestamps to avoid race condition
      const now = Date.now();
      await Message.create([
        { conversation: conversationId, sender: userA._id, type: 'text', content: 'Hello!', createdAt: new Date(now) },
        { conversation: conversationId, sender: userB._id, type: 'text', content: 'Hi Alice', createdAt: new Date(now + 1000) },
        { conversation: conversationId, sender: userA._id, type: 'text', content: 'How are you?', createdAt: new Date(now + 2000) },
      ]);
    });

    test('returns messages sorted by createdAt asc', async () => {
      const res = await request(app)
        .get(`/api/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      expect(res.body[0].content).toBe('Hello!');
      expect(res.body[1].content).toBe('Hi Alice');
      expect(res.body[2].content).toBe('How are you?');
    });

    test('messages include sender info', async () => {
      const res = await request(app)
        .get(`/api/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      expect(res.body[0].sender).toHaveProperty('username');
    });

    test('returns book-share messages', async () => {
      const book = new mongoose.Types.ObjectId();
      await Message.create({
        conversation: conversationId,
        sender: userA._id,
        type: 'book-share',
        content: '',
        sharedBookPage: { book, pageNumber: 5, content: 'Shared page content' },
        createdAt: new Date(Date.now() + 3000),
      });

      const res = await request(app)
        .get(`/api/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      const share = res.body.find(m => m.type === 'book-share');
      expect(share).toBeDefined();
      expect(share.sharedBookPage.pageNumber).toBe(5);
    });

    test('pagination with limit', async () => {
      const res = await request(app)
        .get(`/api/chat/conversations/${conversationId}/messages?limit=2`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    test('pagination with cursor', async () => {
      const all = await Message.find({ conversation: conversationId }).sort({ createdAt: 1 });
      const cursor = all[1].createdAt.toISOString();

      const res = await request(app)
        .get(`/api/chat/conversations/${conversationId}/messages?cursor=${cursor}`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      // cursor queries $lt the given time, so gets messages before message 2
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
  });
});
