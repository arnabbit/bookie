const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const express = require('express');
const User = require('../src/models/User');
const Book = require('../src/models/Book');
const bookRoutes = require('../src/routes/books');

const app = express();
app.use(express.json());
app.use('/api/books', bookRoutes);

const generateToken = (user) =>
  jwt.sign({ id: user._id, username: user.username, email: user.email }, process.env.JWT_SECRET);

describe('Book Routes', () => {
  let token, user;

  beforeEach(async () => {
    user = await User.create({ username: 'librarian', email: 'lib@test.com', isUsernameSet: true });
    token = generateToken(user);

    await Book.create([
      {
        title: 'Book One',
        author: 'Author A',
        description: 'First book',
        coverUrl: 'http://test.com/c1.png',
        pages: [
          { pageNumber: 1, content: 'Page one content' },
          { pageNumber: 2, content: 'Page two content' },
        ],
        uploadedBy: user._id,
      },
      {
        title: 'Book Two',
        author: 'Author B',
        description: 'Second book',
        pages: [{ pageNumber: 1, content: 'Another page' }],
      },
    ]);
  });

  // --- GET /api/books ---
  describe('GET /api/books', () => {
    test('returns all books sorted by createdAt desc', async () => {
      const res = await request(app).get('/api/books').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].title).toBe('Book Two'); // created later, so first
    });

    test('excludes pages from list view', async () => {
      const res = await request(app).get('/api/books').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body[0].pages).toBeUndefined();
    });

    test('requires auth', async () => {
      const res = await request(app).get('/api/books');
      expect(res.status).toBe(401);
    });
  });

  // --- GET /api/books/:id ---
  describe('GET /api/books/:id', () => {
    test('returns book with pages', async () => {
      const book = await Book.findOne({ title: 'Book One' });
      const res = await request(app).get(`/api/books/${book._id}`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Book One');
      expect(res.body.pages).toHaveLength(2);
    });

    test('returns 404 for non-existent book', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app).get(`/api/books/${fakeId}`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    test('requires auth', async () => {
      const book = await Book.findOne();
      const res = await request(app).get(`/api/books/${book._id}`);
      expect(res.status).toBe(401);
    });
  });

  // --- POST /api/books/upload ---
  describe('POST /api/books/upload', () => {
    test('creates a new book with pages', async () => {
      const res = await request(app)
        .post('/api/books/upload')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'New Book',
          author: 'New Author',
          description: 'A new book',
          coverUrl: 'http://test.com/cover.png',
          pages: [
            { pageNumber: 1, content: 'Chapter one' },
            { pageNumber: 2, content: 'Chapter two' },
          ],
        });
      expect(res.status).toBe(201);
      expect(res.body.title).toBe('New Book');
      expect(res.body.author).toBe('New Author');
      expect(res.body.pages).toHaveLength(2);
      expect(res.body.pages[0].content).toBe('Chapter one');
    });

    test('creates book with empty pages if not provided', async () => {
      const res = await request(app)
        .post('/api/books/upload')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Minimal', author: 'Author X' });
      expect(res.status).toBe(201);
      expect(res.body.pages).toEqual([]);
    });

    test('requires auth', async () => {
      const res = await request(app).post('/api/books/upload').send({ title: 'X', author: 'Y' });
      expect(res.status).toBe(401);
    });
  });
});
