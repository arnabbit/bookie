const express = require('express');
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const router = express.Router();

// Search users by username
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 1) return res.json([]);

    const users = await User.find({
      username: { $regex: q, $options: 'i' },
      _id: { $ne: req.user.id },
    })
    .select('username avatar email bio')
    .limit(20);

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check username availability
router.get('/check-username', authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 3) return res.json({ available: false });
    const existing = await User.findOne({
      username: q.toLowerCase(),
      _id: { $ne: req.user.id },
    });
    res.json({ available: !existing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update profile
router.put('/me', authMiddleware, async (req, res) => {
  try {
    const { bio, avatar } = req.body;
    const updates = {};
    if (bio !== undefined) updates.bio = bio;
    if (avatar !== undefined) updates.avatar = avatar;

    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
    }).select('-googleId');
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user profile by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('username avatar bio createdAt');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
