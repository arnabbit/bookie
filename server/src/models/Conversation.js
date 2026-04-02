const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  lastMessagePreview: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now },
});

conversationSchema.index({ participants: 1 });

module.exports = mongoose.model('Conversation', conversationSchema);
