const express = require('express');
const authMiddleware = require('../middleware/auth');
const FriendRequest = require('../models/FriendRequest');
const Friendship = require('../models/Friendship');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const router = express.Router();

// Get pending friend requests (incoming)
router.get('/requests/incoming', authMiddleware, async (req, res) => {
  try {
    const requests = await FriendRequest.find({
      to: req.user.id,
      status: 'pending',
    })
    .populate('from', 'username avatar')
    .sort({ createdAt: -1 });

    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get sent friend requests
router.get('/requests/outgoing', authMiddleware, async (req, res) => {
  try {
    const requests = await FriendRequest.find({
      from: req.user.id,
      status: 'pending',
    })
    .populate('to', 'username avatar')
    .sort({ createdAt: -1 });

    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send friend request
router.post('/requests', authMiddleware, async (req, res) => {
  try {
    const { toUserId } = req.body;

    const existingRequest = await FriendRequest.findOne({
      from: { $in: [req.user.id, toUserId] },
      to: { $in: [req.user.id, toUserId] },
      status: 'pending',
    });
    if (existingRequest) {
      return res.status(409).json({ error: 'Friend request already exists' });
    }

    const request = await FriendRequest.create({
      from: req.user.id,
      to: toUserId,
    });

    res.status(201).json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Respond to friend request
router.put('/requests/:id', authMiddleware, async (req, res) => {
  try {
    const { action } = req.body; // 'accept' or 'reject'
    const request = await FriendRequest.findOne({
      _id: req.params.id,
      to: req.user.id,
      status: 'pending',
    });

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (action === 'accept') {
      request.status = 'accepted';
      await request.save();

      // Create friendship
      const u1 = request.from.toString();
      const u2 = request.to.toString();
      const user1 = u1 < u2 ? u1 : u2;
      const user2 = u1 < u2 ? u2 : u1;

      const friendship = await Friendship.create({ user1, user2 });

      // Create conversation
      const conversation = await Conversation.create({
        participants: [request.from, request.to],
      });

      // Populate response
      const populatedConv = await Conversation.findById(conversation._id)
        .populate('participants', 'username avatar');

      res.json({ request, friendship, conversation: populatedConv });
    } else if (action === 'reject') {
      request.status = 'rejected';
      await request.save();
      res.json(request);
    } else {
      res.status(400).json({ error: 'Invalid action' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get friends list
router.get('/', authMiddleware, async (req, res) => {
  try {
    const friendships = await Friendship.find({
      $or: [{ user1: req.user.id }, { user2: req.user.id }],
    });

    const friendIds = friendships.map((f) =>
      f.user1.toString() === req.user.id ? f.user2 : f.user1
    );

    const friends = await User.find({ _id: { $in: friendIds } }).select(
      'username avatar bio'
    );

    res.json(friends);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Unfriend
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const u1 = req.user.id;
    const u2 = req.params.id;
    const friend1 = u1 < u2 ? u1 : u2;
    const friend2 = u1 < u2 ? u2 : u1;

    await Friendship.findOneAndDelete({ user1: friend1, user2: friend2 });
    res.json({ message: 'Unfriended' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
