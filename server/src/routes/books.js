const express = require('express');
const authMiddleware = require('../middleware/auth');
const Book = require('../models/Book');
const router = express.Router();

// Get all books (no upload for regular users)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const books = await Book.find()
      .select('title author description coverUrl createdAt format pages')
      .sort({ createdAt: -1 });
    res.json(books.map((b) => {
      const total = b.pages?.length || 0;
      return b._doc
        ? { ...b.toObject(), pageCount: total, pageCounts: { mini: Math.ceil(total / 20), pro: Math.ceil(total / 5), ultra: total } }
        : { ...b, pageCount: total, pageCounts: { mini: Math.ceil(total / 20), pro: Math.ceil(total / 5), ultra: total } };
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single book with pages
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ error: 'Book not found' });

    const format = req.query.format || book.format || 'mini';
    const pages = book.pages || [];
    const targetPages = format === 'ultra'
      ? pages.length
      : format === 'pro'
        ? Math.ceil(pages.length / 5)
        : Math.ceil(pages.length / 20);
    const filteredPages = pages.slice(0, targetPages);

    res.json({
      ...book.toObject(),
      format,
      pages: filteredPages,
      pageCount: book.pages.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save reading position for a book
router.post('/:id/position', authMiddleware, async (req, res) => {
  try {
    const { page } = req.body;
    if (typeof page !== 'number' || page < 0) {
      return res.status(400).json({ error: 'Valid page number required' });
    }
    const user = await req.user;
    const User = require('../models/User');
    await User.findByIdAndUpdate(user.id, {
      [`readingPositions.${req.params.id}`]: page,
    });
    res.json({ page });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get reading position for a book
router.get('/:id/position', authMiddleware, async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user.id);
    const page = user?.readingPositions?.get(req.params.id);
    res.json({ page: page ?? 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload book (protected by additional admin check in practice)
router.post('/upload', authMiddleware, async (req, res) => {
  try {
    const { title, author, description, coverUrl, pages } = req.body;
    const book = await Book.create({
      title,
      author,
      description,
      coverUrl,
      pages: pages || [],
      uploadedBy: req.user.id,
    });
    res.status(201).json(book);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
