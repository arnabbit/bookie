const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['text', 'book-share'],
    default: 'text',
  },
  content: { type: String, default: '' },
  sharedBookPage: {
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book' },
    bookTitle: String,
    pageNumber: Number,
    content: String,
  },
  createdAt: { type: Date, default: Date.now },
});

messageSchema.index({ conversation: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
