const express = require('express');
const authMiddleware = require('../middleware/auth');
const Comment = require('../models/Comment');
const Friendship = require('../models/Friendship');
const User = require('../models/User');
const router = express.Router();

// Get comments for a book page - only comments by friends of the requesting user
router.get('/:bookId/:pageNumber', authMiddleware, async (req, res) => {
  try {
    const { bookId, pageNumber } = req.params;
    const pageNum = parseInt(pageNumber, 10);

    // Find user's friends
    const friendships = await Friendship.find({
      $or: [{ user1: req.user.id }, { user2: req.user.id }],
    });
    const friendIds = new Set();
    friendIds.add(req.user.id);
    friendships.forEach((f) => {
      const friendId = f.user1.toString() === req.user.id ? f.user2.toString() : f.user1.toString();
      friendIds.add(friendId);
    });

    const comments = await Comment.find({ book: bookId, pageNumber: pageNum })
      .populate('user', 'username avatar')
      .sort({ createdAt: 1 });

    // Filter: only show comments from friends or self
    const visible = comments.filter((c) => friendIds.has(c.user._id.toString()));

    res.json(visible);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a comment to a book page
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { bookId, pageNumber, content } = req.body;
    if (!bookId || pageNumber === undefined || !content || content.trim().length === 0) {
      return res.status(400).json({ error: 'bookId, pageNumber, and content are required' });
    }
    const comment = await Comment.create({
      user: req.user.id,
      book: bookId,
      pageNumber,
      content: content.trim(),
    });
    const populated = await Comment.findById(comment._id).populate('user', 'username avatar');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a comment
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const comment = await Comment.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id,
    });
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
