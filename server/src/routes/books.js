const express = require('express');
const authMiddleware = require('../middleware/auth');
const Book = require('../models/Book');
const UserBook = require('../models/UserBook');
const router = express.Router();

// Helper: which formats have pages
function availableFormats(book) {
  const out = [];
  if (book.formats?.mini?.length) out.push('mini');
  if (book.formats?.pro?.length) out.push('pro');
  if (book.formats?.ultra?.length) out.push('ultra');
  return out;
}

// Catalogue: all books (no pages)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const books = await Book.find()
      .select('title author coverUrl summary formats createdAt')
      .sort({ createdAt: -1 })
      .lean();

    res.json(books.map((b) => ({
      _id: b._id,
      title: b.title,
      author: b.author,
      coverUrl: b.coverUrl,
      summary: b.summary,
      availableFormats: availableFormats(b),
      pageCounts: {
        mini: b.formats?.mini?.length || 0,
        pro: b.formats?.pro?.length || 0,
        ultra: b.formats?.ultra?.length || 0,
      },
      createdAt: b.createdAt,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// My books: user's library (with reading progress)
router.get('/my-books', authMiddleware, async (req, res) => {
  try {
    const User = require('../models/User');
    const [userBooks, user] = await Promise.all([
      UserBook.find({ userId: req.user.id })
        .populate('bookId', 'title author coverUrl summary formats')
        .sort({ addedAt: -1 })
        .lean(),
      User.findById(req.user.id).lean(),
    ]);
    const positions = user?.readingPositions || {};

    res.json(userBooks.map((ub) => {
      const pageCount = ub.bookId.formats?.[ub.format]?.length || 0;
      const posKey = `${ub.bookId._id.toString()}_${ub.format}`;
      const readingPosition = positions[posKey] ?? positions[ub.bookId._id.toString()] ?? 0;
      return {
        _id: ub.bookId._id,
        title: ub.bookId.title,
        author: ub.bookId.author,
        coverUrl: ub.bookId.coverUrl,
        format: ub.format,
        addedAt: ub.addedAt,
        pageCount,
        readingPosition,
        progress: pageCount > 0 ? Math.min(readingPosition / pageCount, 1) : 0,
      };
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add book to my library
router.post('/my-books', authMiddleware, async (req, res) => {
  try {
    const { bookId, format } = req.body;
    if (!bookId || !format) return res.status(400).json({ error: 'bookId and format required' });

    const book = await Book.findById(bookId).lean();
    if (!book) return res.status(404).json({ error: 'Book not found' });
    if (!book.formats?.[format]?.length) {
      return res.status(400).json({ error: `Format "${format}" not available for this book` });
    }

    const userBook = await UserBook.findOneAndUpdate(
      { userId: req.user.id, bookId },
      { userId: req.user.id, bookId, format },
      { upsert: true, new: true },
    );
    res.status(201).json(userBook);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove book from my library
router.delete('/my-books/:bookId', authMiddleware, async (req, res) => {
  try {
    await UserBook.findOneAndDelete({ userId: req.user.id, bookId: req.params.bookId });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Single book detail
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const book = await Book.findById(req.params.id).lean();
    if (!book) return res.status(404).json({ error: 'Book not found' });

    res.json({
      _id: book._id,
      title: book.title,
      author: book.author,
      coverUrl: book.coverUrl,
      summary: book.summary,
      availableFormats: availableFormats(book),
      pageCounts: {
        mini: book.formats?.mini?.length || 0,
        pro: book.formats?.pro?.length || 0,
        ultra: book.formats?.ultra?.length || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Read book pages for a format
router.get('/:id/read', authMiddleware, async (req, res) => {
  try {
    const book = await Book.findById(req.params.id).lean();
    if (!book) return res.status(404).json({ error: 'Book not found' });

    const format = req.query.format || 'mini';
    const pages = book.formats?.[format] || [];

    res.json({
      _id: book._id,
      title: book.title,
      author: book.author,
      coverUrl: book.coverUrl,
      format,
      pages,
      pageCount: pages.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save reading position (keyed by bookId_format)
router.post('/:id/position', authMiddleware, async (req, res) => {
  try {
    const { page, format } = req.body;
    if (typeof page !== 'number' || page < 0) {
      return res.status(400).json({ error: 'Valid page number required' });
    }
    const key = format ? `${req.params.id}_${format}` : req.params.id;
    const User = require('../models/User');
    await User.findByIdAndUpdate(req.user.id, {
      [`readingPositions.${key}`]: page,
    });
    res.json({ page });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get reading position (keyed by bookId_format)
router.get('/:id/position', authMiddleware, async (req, res) => {
  try {
    const format = req.query.format;
    const key = format ? `${req.params.id}_${format}` : req.params.id;
    const User = require('../models/User');
    const user = await User.findById(req.user.id);
    const page = user?.readingPositions?.get(key);
    res.json({ page: page ?? 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload book (match by title+author, merge format)
router.post('/upload', authMiddleware, async (req, res) => {
  try {
    const { title, author, coverUrl, summary, format, pages } = req.body;
    if (!title || !format || !pages?.length) {
      return res.status(400).json({ error: 'title, format, and pages required' });
    }

    let book = await Book.findOne({
      title: { $regex: new RegExp(`^${title.trim()}$`, 'i') },
      author: { $regex: new RegExp(`^${(author || '').trim()}$`, 'i') },
    });

    if (book) {
      book.formats[format] = pages;
      if (summary) book.summary = summary;
      if (coverUrl) book.coverUrl = coverUrl;
      await book.save();
    } else {
      book = await Book.create({
        title: title.trim(),
        author: (author || '').trim(),
        coverUrl,
        summary: summary || '',
        formats: { mini: [], pro: [], ultra: [], [format]: pages },
        uploadedBy: req.user.id,
      });
    }

    res.status(201).json({
      _id: book._id,
      title: book.title,
      author: book.author,
      availableFormats: availableFormats(book),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
