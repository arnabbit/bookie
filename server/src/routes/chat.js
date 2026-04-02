const express = require('express');
const authMiddleware = require('../middleware/auth');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const router = express.Router();

// Get or create conversation with a user
router.post('/conversation/with/:userId', authMiddleware, async (req, res) => {
  try {
    const userId = req.params.userId;

    let conversation = await Conversation.findOne({
      participants: { $all: [req.user.id, userId] },
    })
    .populate('participants', 'username avatar')
    .populate('lastMessage');

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [req.user.id, userId],
      });
      conversation = await conversation.populate('participants', 'username avatar');
    }

    res.json(conversation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all conversations for current user
router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: { $in: [req.user.id] },
    })
    .populate('participants', 'username avatar')
    .populate('lastMessage')
    .sort({ updatedAt: -1 });

    res.json(conversations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get messages for a conversation (paginated)
router.get('/conversations/:id/messages', authMiddleware, async (req, res) => {
  try {
    const { limit = 50, cursor } = req.query;
    const query = { conversation: req.params.id };

    if (cursor) {
      query.createdAt = { $lt: new Date(cursor) };
    }

    const messages = await Message.find(query)
      .populate('sender', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
