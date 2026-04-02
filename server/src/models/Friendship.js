const mongoose = require('mongoose');

const friendshipSchema = new mongoose.Schema({
  user1: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  user2: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
});

friendshipSchema.index({ user1: 1, user2: 1 }, { unique: true });

module.exports = mongoose.model('Friendship', friendshipSchema);
