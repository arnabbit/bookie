const express = require('express');
const adminMiddleware = require('../middleware/admin');
const Book = require('../models/Book');
const router = express.Router();

// All routes require admin
router.use(adminMiddleware);

function availableFormats(book) {
  const out = [];
  if (book.formats?.mini?.length) out.push('mini');
  if (book.formats?.pro?.length) out.push('pro');
  if (book.formats?.ultra?.length) out.push('ultra');
  return out;
}

// GET /api/admin/gemini-key — return server Gemini key to admin client
router.get('/gemini-key', (req, res) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(404).json({ error: 'GEMINI_API_KEY not configured on server' });
  res.json({ key });
});

// GET /api/admin/openrouter-key — return server OpenRouter key to admin client
router.get('/openrouter-key', (req, res) => {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return res.status(404).json({ error: 'OPENROUTER_API_KEY not configured on server' });
  res.json({ key });
});

// GET /api/admin/books — list all books with format status
router.get('/books', async (req, res) => {
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
      summary: b.summary || '',
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

// GET /api/admin/books/:id — full book with all format pages
router.get('/books/:id', async (req, res) => {
  try {
    const book = await Book.findById(req.params.id).lean();
    if (!book) return res.status(404).json({ error: 'Book not found' });
    res.json(book);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/books — create new book
router.post('/books', async (req, res) => {
  try {
    const { title, author, summary, coverUrl } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });

    const book = await Book.create({
      title: title.trim(),
      author: (author || '').trim(),
      summary: summary || '',
      coverUrl: coverUrl || '',
      formats: { mini: [], pro: [], ultra: [] },
      uploadedBy: req.user.id,
    });
    res.status(201).json(book);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/books/:id — update metadata
router.put('/books/:id', async (req, res) => {
  try {
    const { title, author, summary, coverUrl } = req.body;
    const update = {};
    if (title !== undefined) update.title = title.trim();
    if (author !== undefined) update.author = author.trim();
    if (summary !== undefined) update.summary = summary;
    if (coverUrl !== undefined) update.coverUrl = coverUrl;

    const book = await Book.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
    if (!book) return res.status(404).json({ error: 'Book not found' });
    res.json(book);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/books/:id — delete book
router.delete('/books/:id', async (req, res) => {
  try {
    const book = await Book.findByIdAndDelete(req.params.id);
    if (!book) return res.status(404).json({ error: 'Book not found' });
    // Also remove UserBook entries
    const UserBook = require('../models/UserBook');
    await UserBook.deleteMany({ bookId: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/books/:id/format/:format — set all pages for a format
router.put('/books/:id/format/:format', async (req, res) => {
  try {
    const { format } = req.params;
    if (!['mini', 'pro', 'ultra'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format' });
    }
    const { pages } = req.body;
    if (!Array.isArray(pages)) return res.status(400).json({ error: 'pages array required' });

    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ error: 'Book not found' });

    book.formats[format] = pages.map((p, i) => ({
      pageNumber: p.pageNumber ?? i + 1,
      content: p.content || '',
      imageUrl: p.imageUrl || '',
    }));
    await book.save();

    res.json({
      format,
      pageCount: book.formats[format].length,
      pages: book.formats[format],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/books/:id/format/:format — clear a format
router.delete('/books/:id/format/:format', async (req, res) => {
  try {
    const { format } = req.params;
    if (!['mini', 'pro', 'ultra'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format' });
    }
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ error: 'Book not found' });

    book.formats[format] = [];
    await book.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/books/:id/format/:format/page/:pageNum — edit single page
router.put('/books/:id/format/:format/page/:pageNum', async (req, res) => {
  try {
    const { format, pageNum } = req.params;
    const idx = parseInt(pageNum) - 1;
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ error: 'Book not found' });
    if (!book.formats[format] || idx < 0 || idx >= book.formats[format].length) {
      return res.status(404).json({ error: 'Page not found' });
    }

    if (req.body.content !== undefined) book.formats[format][idx].content = req.body.content;
    if (req.body.imageUrl !== undefined) book.formats[format][idx].imageUrl = req.body.imageUrl;
    await book.save();
    res.json(book.formats[format][idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/books/:id/format/:format/page — add new page
router.post('/books/:id/format/:format/page', async (req, res) => {
  try {
    const { format } = req.params;
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ error: 'Book not found' });

    const pageNum = (book.formats[format]?.length || 0) + 1;
    book.formats[format].push({
      pageNumber: pageNum,
      content: req.body.content || '',
      imageUrl: req.body.imageUrl || '',
    });
    await book.save();
    res.status(201).json(book.formats[format][book.formats[format].length - 1]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/books/:id/format/:format/page/:pageNum — delete page
router.delete('/books/:id/format/:format/page/:pageNum', async (req, res) => {
  try {
    const { format, pageNum } = req.params;
    const idx = parseInt(pageNum) - 1;
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ error: 'Book not found' });
    if (!book.formats[format] || idx < 0 || idx >= book.formats[format].length) {
      return res.status(404).json({ error: 'Page not found' });
    }

    book.formats[format].splice(idx, 1);
    // Renumber
    book.formats[format].forEach((p, i) => { p.pageNumber = i + 1; });
    await book.save();
    res.json({ ok: true, pageCount: book.formats[format].length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
