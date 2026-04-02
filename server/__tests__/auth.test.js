const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const express = require('express');
const User = require('../src/models/User');
const authRoutes = require('../src/routes/auth');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

const generateToken = (user) =>
  jwt.sign({ id: user._id, username: user.username, email: user.email }, process.env.JWT_SECRET);

describe('Auth Routes', () => {
  // --- GET /api/auth/failure ---
  describe('GET /api/auth/failure', () => {
    test('returns 401 with error message', async () => {
      const res = await request(app).get('/api/auth/failure');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authentication failed');
    });
  });

  // --- GET /api/auth/me ---
  describe('GET /api/auth/me', () => {
    let token, userId;

    beforeEach(async () => {
      const user = await User.create({
        username: 'meuser',
        email: 'me@test.com',
        isUsernameSet: true,
        bio: 'My bio',
        avatar: 'http://test.com/avatar.png',
      });
      userId = user._id;
      token = generateToken(user);
    });

    test('returns current user without googleId', async () => {
      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.email).toBe('me@test.com');
      expect(res.body.googleId).toBeUndefined();
    });

    test('returns 401 without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    test('returns 401 with invalid token', async () => {
      const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer invalidtoken');
      expect(res.status).toBe(401);
    });

    test('returns 404 for deleted user', async () => {
      await User.deleteMany({});
      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  // --- POST /api/auth/username ---
  describe('POST /api/auth/username', () => {
    let token, user;

    beforeEach(async () => {
      user = await User.create({
        email: 'nousername@test.com',
      });
      token = generateToken(user);
    });

    test('sets username successfully', async () => {
      const res = await request(app)
        .post('/api/auth/username')
        .set('Authorization', `Bearer ${token}`)
        .send({ username: 'mynewname' });
      expect(res.status).toBe(200);
      expect(res.body.username).toBe('mynewname');
      expect(res.body.isUsernameSet).toBe(true);
    });

    test('username is lowercased', async () => {
      const res = await request(app)
        .post('/api/auth/username')
        .set('Authorization', `Bearer ${token}`)
        .send({ username: 'MyNewName' });
      expect(res.status).toBe(200);
      expect(res.body.username).toBe('mynewname');
    });

    test('returns 400 for username too short', async () => {
      const res = await request(app)
        .post('/api/auth/username')
        .set('Authorization', `Bearer ${token}`)
        .send({ username: 'ab' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('3-20');
    });

    test('returns 400 for username too long', async () => {
      const res = await request(app)
        .post('/api/auth/username')
        .set('Authorization', `Bearer ${token}`)
        .send({ username: 'a'.repeat(21) });
      expect(res.status).toBe(400);
    });

    test('returns 400 for invalid characters', async () => {
      const res = await request(app)
        .post('/api/auth/username')
        .set('Authorization', `Bearer ${token}`)
        .send({ username: 'my-name!' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('letters, numbers');
    });

    test('returns 409 for taken username', async () => {
      await User.create({ username: 'taken', email: 'taken@test.com', isUsernameSet: true });
      const res = await request(app)
        .post('/api/auth/username')
        .set('Authorization', `Bearer ${token}`)
        .send({ username: 'taken' });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Username already taken');
    });

    test('requires auth', async () => {
      const res = await request(app).post('/api/auth/username').send({ username: 'test' });
      expect(res.status).toBe(401);
    });

    test('empty username returns 400', async () => {
      const res = await request(app)
        .post('/api/auth/username')
        .set('Authorization', `Bearer ${token}`)
        .send({ username: '' });
      expect(res.status).toBe(400);
    });
  });
});
