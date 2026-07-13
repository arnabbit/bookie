const express = require('express');
const authMiddleware = require('../middleware/auth');
const Book = require('../models/Book');
const UserBook = require('../models/UserBook');
const { applyStreakTransition, isValidDay, dayDiff } = require('../lib/streak');
const router = express.Router();

// Roughly 30 seconds of reading per page.
const SECONDS_PER_PAGE = 30;

// Helper: which formats have pages
function availableFormats(book) {
  const out = [];
  if (book.formats?.mini?.length) out.push('mini');
  if (book.formats?.pro?.length) out.push('pro');
  if (book.formats?.ultra?.length) out.push('ultra');
  return out;
}

// Estimated read time (minutes) per format.
function readMinutes(book) {
  const minutesFor = (n) => (n > 0 ? Math.ceil((n * SECONDS_PER_PAGE) / 60) : 0);
  return {
    mini: minutesFor(book.formats?.mini?.length || 0),
    pro: minutesFor(book.formats?.pro?.length || 0),
    ultra: minutesFor(book.formats?.ultra?.length || 0),
  };
}

// Outgoing "get the real book" link. Uses the curated amazonUrl when present,
// otherwise an Amazon search URL. The affiliate tag stays server-side so it can
// change without an app release and never ships in the client bundle.
function purchaseUrl(book) {
  if (book.amazonUrl) return book.amazonUrl;
  const q = encodeURIComponent(`${book.title || ''} ${book.author || ''}`.trim());
  let url = `https://www.amazon.com/s?k=${q}`;
  if (process.env.AMAZON_AFFILIATE_TAG) {
    url += `&tag=${encodeURIComponent(process.env.AMAZON_AFFILIATE_TAG)}`;
  }
  return url;
}

// Resolve the calendar day a read happened on. Trust the client's local day
// only when it is within ±1 day of the server's UTC day (guards clock skew /
// spoofing); otherwise fall back to the server day.
function resolveLocalDay(localDate) {
  const serverDay = new Date().toISOString().slice(0, 10);
  if (isValidDay(localDate) && Math.abs(dayDiff(serverDay, localDate)) <= 1) {
    return localDate;
  }
  return serverDay;
}

// Catalogue: all books (no pages)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const books = await Book.find()
      .select('title author coverUrl summary formats amazonUrl createdAt')
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
      readMinutes: readMinutes(b),
      purchaseUrl: purchaseUrl(b),
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
        .populate('bookId', 'title author coverUrl summary formats amazonUrl')
        .sort({ addedAt: -1 })
        .lean(),
      User.findById(req.user.id).lean(),
    ]);
    const positions = user?.readingPositions || {};

    res.json(userBooks.map((ub) => {
      const pageCount = ub.bookId.formats?.[ub.format]?.length || 0;
      // Prefer the position stored on the UserBook; fall back to the legacy
      // User.readingPositions Map for rows written before this migration.
      const posKey = `${ub.bookId._id.toString()}_${ub.format}`;
      const legacyPos = positions[posKey] ?? positions[ub.bookId._id.toString()] ?? 0;
      const readingPosition = ub.lastPage ?? legacyPos;
      return {
        _id: ub.bookId._id,
        title: ub.bookId.title,
        author: ub.bookId.author,
        coverUrl: ub.bookId.coverUrl,
        format: ub.format,
        addedAt: ub.addedAt,
        pageCount,
        readingPosition,
        progress: pageCount > 0 ? Math.min((readingPosition + 1) / pageCount, 1) : 0,
        finishedAt: ub.finishedAt || null,
        readMinutes: readMinutes(ub.bookId),
        purchaseUrl: purchaseUrl(ub.bookId),
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
      readMinutes: readMinutes(book),
      purchaseUrl: purchaseUrl(book),
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
      readMinutes: readMinutes(book),
      purchaseUrl: purchaseUrl(book),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save reading position. Also drives completion + daily streak.
router.post('/:id/position', authMiddleware, async (req, res) => {
  try {
    const { page, format, localDate } = req.body;
    if (typeof page !== 'number' || page < 0) {
      return res.status(400).json({ error: 'Valid page number required' });
    }
    const fmt = format || 'mini';
    const User = require('../models/User');
    const book = await Book.findById(req.params.id).select('title author formats amazonUrl').lean();
    if (!book) return res.status(404).json({ error: 'Book not found' });

    const pageCount = book.formats?.[fmt]?.length || 0;
    const atLastPage = pageCount > 0 && page >= pageCount - 1;

    // Persist progress on the UserBook row when the book is in the library;
    // otherwise keep the legacy Map so ad-hoc reads still restore.
    let finished = false;
    let finishedNow = false;
    const ub = await UserBook.findOne({ userId: req.user.id, bookId: req.params.id });
    if (ub) {
      ub.lastPage = page;
      ub.format = fmt;
      if (atLastPage && !ub.finishedAt) {
        ub.finishedAt = new Date();
        finishedNow = true;
      }
      finished = !!ub.finishedAt;
      await ub.save();
    } else {
      const key = `${req.params.id}_${fmt}`;
      await User.findByIdAndUpdate(req.user.id, { [`readingPositions.${key}`]: page });
      finished = atLastPage;
    }

    // Daily streak: first save of the day extends it.
    const today = resolveLocalDay(localDate);
    const user = await User.findById(req.user.id);
    const { streak: nextStreak, extendedToday } = applyStreakTransition(user.streak, today);
    user.streak = nextStreak;
    await user.save();

    res.json({
      page,
      finished,
      finishedNow,
      purchaseUrl: purchaseUrl(book),
      streak: {
        current: nextStreak.current,
        longest: nextStreak.longest,
        freezeTokens: nextStreak.freezeTokens,
        extendedToday,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get reading position. Prefers UserBook.lastPage, falls back to legacy Map.
router.get('/:id/position', authMiddleware, async (req, res) => {
  try {
    const format = req.query.format;
    const User = require('../models/User');
    const ub = await UserBook.findOne({ userId: req.user.id, bookId: req.params.id }).lean();
    if (ub && typeof ub.lastPage === 'number') {
      return res.json({ page: ub.lastPage });
    }
    const key = format ? `${req.params.id}_${format}` : req.params.id;
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
    const { title, author, coverUrl, summary, format, pages, amazonUrl } = req.body;
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
      if (amazonUrl !== undefined) book.amazonUrl = amazonUrl;
      await book.save();
    } else {
      book = await Book.create({
        title: title.trim(),
        author: (author || '').trim(),
        coverUrl,
        summary: summary || '',
        amazonUrl: amazonUrl || '',
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
