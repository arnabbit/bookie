jest.mock('../src/models/Comment');
jest.mock('../src/models/Friendship');
jest.mock('../src/models/User');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const express = require('express');
const Comment = require('../src/models/Comment');
const Friendship = require('../src/models/Friendship');
const commentRoutes = require('../src/routes/comments');

const generateToken = (userId, username = 'testuser', email = 'test@test.com') =>
  jwt.sign({ id: userId, username, email }, 'test_jwt_secret');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/comments', commentRoutes);
  return app;
}

const aliceId = 'a'.repeat(24);
const bobId = 'b'.repeat(24);
const charlieId = 'c'.repeat(24);
const bookId = 'd'.repeat(24);

const mockComment = (userId, username, content, pgNum) => ({
  _id: `${userId.slice(0, 8)}${pgNum}`,
  user: { _id: userId, username },
  book: bookId,
  pageNumber: pgNum,
  content,
  createdAt: '2025-01-01T00:00:00Z',
});

beforeEach(() => {
  process.env.JWT_SECRET = 'test_jwt_secret';
  jest.resetAllMocks();
});

describe('Comments', () => {
  describe('GET /api/comments/:bookId/:pageNumber', () => {
    beforeEach(() => {
      Friendship.find.mockResolvedValue([
        { user1: aliceId, user2: bobId },
      ]);
      Comment.find.mockReturnValue({
        populate: () => ({
          sort: () => Promise.resolve([
            mockComment(bobId, 'bob', 'Great page!', 1),
            mockComment(aliceId, 'alice', 'My comment', 1),
            mockComment(charlieId, 'charlie', 'Stranger here', 1),
          ]),
        }),
      });
    });

    test('alice sees bob and her own comments but not charlie\'s', async () => {
      const res = await request(buildApp())
        .get(`/api/comments/${bookId}/1`)
        .set('Authorization', `Bearer ${generateToken(aliceId, 'alice')}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      const usernames = res.body.map((c) => c.user.username);
      expect(usernames).toContain('bob');
      expect(usernames).toContain('alice');
      expect(usernames).not.toContain('charlie');
    });

    test('charlie with no friends sees no one else\'s comments', async () => {
      Friendship.find.mockResolvedValue([]);
      const res = await request(buildApp())
        .get(`/api/comments/${bookId}/1`)
        .set('Authorization', `Bearer ${generateToken(charlieId, 'charlie')}`);
      expect(res.status).toBe(200);
      const usernames = res.body.map((c) => c.user.username);
      expect(usernames).not.toContain('alice');
      expect(usernames).not.toContain('bob');
      expect(usernames).toContain('charlie');
    });

    test('returns empty array when no comments exist', async () => {
      Comment.find.mockReturnValue({
        populate: () => ({ sort: () => Promise.resolve([]) }),
      });
      const res = await request(buildApp())
        .get(`/api/comments/${bookId}/99`)
        .set('Authorization', `Bearer ${generateToken(aliceId, 'alice')}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    test('requires auth', async () => {
      const res = await request(buildApp()).get(`/api/comments/${bookId}/1`);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/comments', () => {
    beforeEach(() => {
      Comment.create.mockImplementation((data) =>
        Promise.resolve({ _id: 'newComment123', ...data })
      );
      Comment.findById.mockReturnValue({
        populate: () => Promise.resolve(
          mockComment(aliceId, 'testuser', 'Test comment', 1)
        ),
      });
    });

    test('creates comment and returns populated user', async () => {
      const res = await request(buildApp())
        .post('/api/comments')
        .set('Authorization', `Bearer ${generateToken(aliceId, 'testuser')}`)
        .send({ bookId, pageNumber: 1, content: 'Test comment' });
      expect(res.status).toBe(201);
      expect(res.body.content).toBe('Test comment');
      expect(res.body.user.username).toBe('testuser');
      expect(res.body.pageNumber).toBe(1);
    });

    test('trims whitespace from content', async () => {
      const res = await request(buildApp())
        .post('/api/comments')
        .set('Authorization', `Bearer ${generateToken(aliceId, 'testuser')}`)
        .send({ bookId, pageNumber: 1, content: '  padded  ' });
      expect(res.status).toBe(201);
      expect(res.body.content).toBe('padded');
    });

    test('returns 400 when bookId is missing', async () => {
      const res = await request(buildApp())
        .post('/api/comments')
        .set('Authorization', `Bearer ${generateToken(aliceId, 'testuser')}`)
        .send({ pageNumber: 1, content: 'No book' });
      expect(res.status).toBe(400);
    });

    test('returns 400 when content is empty after trim', async () => {
      const res = await request(buildApp())
        .post('/api/comments')
        .set('Authorization', `Bearer ${generateToken(aliceId, 'testuser')}`)
        .send({ bookId, pageNumber: 1, content: '   ' });
      expect(res.status).toBe(400);
    });

    test('requires auth', async () => {
      const res = await request(buildApp())
        .post('/api/comments')
        .send({ bookId, pageNumber: 1, content: 'Test' });
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/comments/:id', () => {
    test('can delete own comment', async () => {
      Comment.findOneAndDelete.mockResolvedValue({ _id: 'c1' });
      const res = await request(buildApp())
        .delete(`/api/comments/c1`)
        .set('Authorization', `Bearer ${generateToken(aliceId, 'testuser')}`);
      expect(res.status).toBe(200);
      expect(Comment.findOneAndDelete).toHaveBeenCalledWith({
        _id: 'c1',
        user: aliceId,
      });
    });

    test('returns 404 when comment not found or not owned', async () => {
      Comment.findOneAndDelete.mockResolvedValue(null);
      const res = await request(buildApp())
        .delete(`/api/comments/c1`)
        .set('Authorization', `Bearer ${generateToken(aliceId, 'testuser')}`);
      expect(res.status).toBe(404);
    });

    test('requires auth', async () => {
      const res = await request(buildApp()).delete('/api/comments/c1');
      expect(res.status).toBe(401);
    });
  });
});
