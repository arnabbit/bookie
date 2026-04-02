const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const express = require('express');
const User = require('../src/models/User');
const FriendRequest = require('../src/models/FriendRequest');
const Friendship = require('../src/models/Friendship');
const friendRoutes = require('../src/routes/friends');

const app = express();
app.use(express.json());
app.use('/api/friends', friendRoutes);

const generateToken = (user) =>
  jwt.sign({ id: user._id, username: user.username, email: user.email }, process.env.JWT_SECRET);

describe('Friend Routes', () => {
  let tokenA, tokenB, userA, userB, tokenC;

  beforeEach(async () => {
    userA = await User.create({ username: 'alice', email: 'alice@test.com', isUsernameSet: true });
    userB = await User.create({ username: 'bob', email: 'bob@test.com', isUsernameSet: true });
    const userC = await User.create({ username: 'charlie', email: 'charlie@test.com', isUsernameSet: true });
    tokenA = generateToken(userA);
    tokenB = generateToken(userB);
    tokenC = generateToken(userC);
  });

  // --- GET /api/friends/requests/incoming ---
  describe('GET /api/friends/requests/incoming', () => {
    test('returns pending incoming requests', async () => {
      await FriendRequest.create({ from: userB._id, to: userA._id });
      const res = await request(app).get('/api/friends/requests/incoming').set('Authorization', `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].from.username).toBe('bob');
    });

    test('returns only pending requests, not accepted/rejected', async () => {
      await FriendRequest.create({ from: userB._id, to: userA._id, status: 'accepted' });
      const res = await request(app).get('/api/friends/requests/incoming').set('Authorization', `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    test('empty when no requests', async () => {
      const res = await request(app).get('/api/friends/requests/incoming').set('Authorization', `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    test('requires auth', async () => {
      const res = await request(app).get('/api/friends/requests/incoming');
      expect(res.status).toBe(401);
    });
  });

  // --- GET /api/friends/requests/outgoing ---
  describe('GET /api/friends/requests/outgoing', () => {
    test('returns pending outgoing requests', async () => {
      await FriendRequest.create({ from: userA._id, to: userB._id });
      const res = await request(app).get('/api/friends/requests/outgoing').set('Authorization', `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].to.username).toBe('bob');
    });

    test('requires auth', async () => {
      const res = await request(app).get('/api/friends/requests/outgoing');
      expect(res.status).toBe(401);
    });
  });

  // --- POST /api/friends/requests ---
  describe('POST /api/friends/requests', () => {
    test('sends friend request successfully', async () => {
      const res = await request(app)
        .post('/api/friends/requests')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ toUserId: userB._id });
      expect(res.status).toBe(201);
      expect(res.body.from).toBe(userA._id.toString());
      expect(res.body.to).toBe(userB._id.toString());
      expect(res.body.status).toBe('pending');
    });

    test('returns 409 if request already exists', async () => {
      await FriendRequest.create({ from: userA._id, to: userB._id });
      const res = await request(app)
        .post('/api/friends/requests')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ toUserId: userB._id });
      expect(res.status).toBe(409);
    });

    test('returns 409 if reverse request already exists', async () => {
      await FriendRequest.create({ from: userB._id, to: userA._id });
      const res = await request(app)
        .post('/api/friends/requests')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ toUserId: userB._id });
      expect(res.status).toBe(409);
    });

    test('requires auth', async () => {
      const res = await request(app).post('/api/friends/requests').send({ toUserId: userB._id });
      expect(res.status).toBe(401);
    });
  });

  // --- PUT /api/friends/requests/:id ---
  describe('PUT /api/friends/requests/:id', () => {
    test('accept friend request creates friendship', async () => {
      const friendReq = await FriendRequest.create({ from: userB._id, to: userA._id });
      const res = await request(app)
        .put(`/api/friends/requests/${friendReq._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ action: 'accept' });
      expect(res.status).toBe(200);
      expect(res.body.request.status).toBe('accepted');
      expect(res.body.friendship).toBeDefined();
      expect(res.body.conversation).toBeDefined();
      expect(res.body.conversation.participants).toHaveLength(2);
    });

    test('accepting creates conversation with both users as participants', async () => {
      const friendReq = await FriendRequest.create({ from: userB._id, to: userA._id });
      const res = await request(app)
        .put(`/api/friends/requests/${friendReq._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ action: 'accept' });
      expect(res.status).toBe(200);
      const conv = res.body.conversation;
      const participantIds = conv.participants.map((p) => p._id).sort();
      expect([userA._id.toString(), userB._id.toString()]).toEqual(participantIds);
    });

    test('reject friend request', async () => {
      const friendReq = await FriendRequest.create({ from: userB._id, to: userA._id });
      const res = await request(app)
        .put(`/api/friends/requests/${friendReq._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ action: 'reject' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('rejected');
    });

    test('returns 404 for non-existent request', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .put(`/api/friends/requests/${fakeId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ action: 'accept' });
      expect(res.status).toBe(404);
    });

    test('returns 400 for invalid action', async () => {
      const friendReq = await FriendRequest.create({ from: userB._id, to: userA._id });
      const res = await request(app)
        .put(`/api/friends/requests/${friendReq._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ action: 'invalid' });
      expect(res.status).toBe(400);
    });

    test('friendship user1 is always the smaller ObjectId', async () => {
      const friendReq = await FriendRequest.create({ from: userB._id, to: userA._id });
      await request(app)
        .put(`/api/friends/requests/${friendReq._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ action: 'accept' });

      const friendship = await Friendship.findOne();
      expect(friendship.user1.toString() < friendship.user2.toString()).toBe(true);
    });
  });

  // --- GET /api/friends ---
  describe('GET /api/friends', () => {
    test('returns friends list', async () => {
      const friendReq = await FriendRequest.create({ from: userB._id, to: userA._id });
      await request(app)
        .put(`/api/friends/requests/${friendReq._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ action: 'accept' });

      const res = await request(app).get('/api/friends').set('Authorization', `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].username).toBe('bob');
    });

    test('returns empty when no friendships', async () => {
      const res = await request(app).get('/api/friends').set('Authorization', `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });
  });

  // --- DELETE /api/friends/:id ---
  describe('DELETE /api/friends/:id', () => {
    test('unfriend removes friendship', async () => {
      const friendReq = await FriendRequest.create({ from: userB._id, to: userA._id });
      await request(app)
        .put(`/api/friends/requests/${friendReq._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ action: 'accept' });

      const res = await request(app)
        .delete(`/api/friends/${userB._id}`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Unfriended');

      const remaining = await Friendship.find({
        $or: [{ user1: userA._id }, { user2: userA._id }],
      });
      expect(remaining).toHaveLength(0);
    });

    test('requires auth', async () => {
      const res = await request(app).delete(`/api/friends/${userB._id}`);
      expect(res.status).toBe(401);
    });
  });
});
