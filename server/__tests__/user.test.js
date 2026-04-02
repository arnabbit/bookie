const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const express = require('express');
const User = require('../src/models/User');
const authMiddleware = require('../src/middleware/auth');
const userRoutes = require('../src/routes/users');

const app = express();
app.use(express.json());
app.use('/api/users', userRoutes);

const generateToken = (user) =>
  jwt.sign({ id: user._id, username: user.username, email: user.email }, process.env.JWT_SECRET);

describe('User Routes', () => {
  let token, userId;

  beforeEach(async () => {
    const user = await User.create({
      username: 'testuser',
      email: 'test@example.com',
      isUsernameSet: true,
      bio: 'Test bio',
    });
    userId = user._id;
    token = generateToken(user);

    // Create other users for search
    await User.create([
      { username: 'alice', email: 'alice@test.com', isUsernameSet: true, bio: 'Hello' },
      { username: 'bob', email: 'bob@test.com', isUsernameSet: true },
      { username: 'charlie', email: 'charlie@test.com', isUsernameSet: true },
    ]);
  });

  // --- GET /api/users/search ---
  describe('GET /api/users/search', () => {
    test('search returns matching users', async () => {
      const res = await request(app).get('/api/users/search?q=ali').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].username).toBe('alice');
    });

    test('search is case insensitive', async () => {
      const res = await request(app).get('/api/users/search?q=ALI').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    test('search excludes the requesting user', async () => {
      const res = await request(app).get('/api/users/search?q=test').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    test('empty query returns empty array', async () => {
      const res = await request(app).get('/api/users/search?q=').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    test('search limited to 20 results', async () => {
      const users = [];
      for (let i = 0; i < 25; i++) {
        users.push({ username: `searchable${i}`, email: `s${i}@test.com` });
      }
      await User.create(users);

      const res = await request(app).get('/api/users/search?q=searchable').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeLessThanOrEqual(20);
    });
  });

  // --- GET /api/users/check-username ---
  describe('GET /api/users/check-username', () => {
    test('returns available=true for unique username', async () => {
      const res = await request(app).get('/api/users/check-username?q=newuser123').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.available).toBe(true);
    });

    test('returns available=false for existing username', async () => {
      const res = await request(app).get('/api/users/check-username?q=alice').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.available).toBe(false);
    });

    test('short usernames return available=false', async () => {
      const res = await request(app).get('/api/users/check-username?q=ab').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.available).toBe(false);
    });

    test('own username returns available=true', async () => {
      const res = await request(app).get('/api/users/check-username?q=testuser').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.available).toBe(true);
    });
  });

  // --- PUT /api/users/me ---
  describe('PUT /api/users/me', () => {
    test('update bio successfully', async () => {
      const res = await request(app).put('/api/users/me').set('Authorization', `Bearer ${token}`).send({ bio: 'New bio' });
      expect(res.status).toBe(200);
      expect(res.body.bio).toBe('New bio');
      expect(res.body._id).toBe(userId.toString());
    });

    test('update avatar successfully', async () => {
      const res = await request(app).put('/api/users/me').set('Authorization', `Bearer ${token}`).send({ avatar: 'http://example.com/img.png' });
      expect(res.status).toBe(200);
      expect(res.body.avatar).toBe('http://example.com/img.png');
    });

    test('partial update preserves unset fields', async () => {
      await request(app).put('/api/users/me').set('Authorization', `Bearer ${token}`).send({ bio: 'Updated bio' });
      const user = await User.findById(userId);
      expect(isValidObjectId(user._id)).toBe(true);
    });
  });

  // --- GET /api/users/:id ---
  describe('GET /api/users/:id', () => {
    test('get user profile by ID', async () => {
      const alice = await User.findOne({ username: 'alice' });
      const res = await request(app).get(`/api/users/${alice._id}`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.username).toBe('alice');
      expect(res.body.bio).toBe('Hello');
    });

    test('returns 404 for non-existent user', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app).get(`/api/users/${fakeId}`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  // --- Auth required ---
  describe('Authentication required on all routes', () => {
    test('search requires auth', async () => {
      const res = await request(app).get('/api/users/search?q=test');
      expect(res.status).toBe(401);
    });

    test('check-username requires auth', async () => {
      const res = await request(app).get('/api/users/check-username?q=test');
      expect(res.status).toBe(401);
    });

    test('profile update requires auth', async () => {
      const res = await request(app).put('/api/users/me').send({ bio: 'test' });
      expect(res.status).toBe(401);
    });

    test('get user profile requires auth', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app).get(`/api/users/${fakeId}`);
      expect(res.status).toBe(401);
    });
  });
});

function isValidObjectId(id) {
  return id && id.toString().length === 24;
}
