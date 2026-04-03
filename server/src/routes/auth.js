const express = require('express');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const router = express.Router();

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, username: user.username, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
};

// Math captcha answer cache (in-memory, short-lived)
const captchaAnswers = new Map();

// POST /api/auth/captcha — generate a math captcha
router.post('/captcha', (req, res) => {
  const a = Math.floor(Math.random() * 10) + 1;
  const b = Math.floor(Math.random() * 10) + 1;
  const ops = ['+', '×'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  const answer = op === '+' ? a + b : a * b;
  const question = `${a} ${op} ${b}`;
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  captchaAnswers.set(id, answer);
  setTimeout(() => captchaAnswers.delete(id), 300000);
  res.json({ id, question });
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, captchaId, captchaAnswer } = req.body;

    // Validate captcha
    const correctAnswer = captchaAnswers.get(captchaId);
    if (correctAnswer == null || parseInt(captchaAnswer) !== correctAnswer) {
      return res.status(400).json({ error: 'Invalid captcha' });
    }
    captchaAnswers.delete(captchaId);

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (password.length > 72) {
      return res.status(400).json({ error: 'Password must be at most 72 characters' });
    }

    const user = await User.create({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password,
    });

    const token = generateToken(user);
    res.status(201).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      const field = err.keyPattern ? Object.keys(err.keyPattern)[0] : 'username';
      return res.status(409).json({ error: `${field} already taken` });
    }
    res.status(400).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    user.lastSeen = new Date();
    await user.save();

    const token = generateToken(user);
    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/enter — auto-registration: login if exists, register if not
router.post('/enter', async (req, res) => {
  try {
    const { username, password, captchaId, captchaAnswer } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Validate captcha
    const correctAnswer = captchaAnswers.get(captchaId);
    if (correctAnswer == null || parseInt(captchaAnswer) !== correctAnswer) {
      return res.status(400).json({ error: 'Invalid captcha' });
    }
    captchaAnswers.delete(captchaId);

    const existing = await User.findOne({ username: username.toLowerCase() });
    if (existing) {
      const isMatch = await existing.comparePassword(password);
      if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
      existing.lastSeen = new Date();
      await existing.save();
      return res.json({
        token: generateToken(existing),
        user: { id: existing._id, username: existing.username, email: existing.email },
      });
    }

    // New user — auto-register
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: 'Letters, numbers, underscores only' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const user = await User.create({
      username: username.toLowerCase(),
      email: `${username.toLowerCase()}@booksocial.local`,
      password,
    });
    res.status(201).json({
      token: generateToken(user),
      user: { id: user._id, username: user.username, email: user.email },
      isNew: true,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Username already taken' });
    }
    res.status(400).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
