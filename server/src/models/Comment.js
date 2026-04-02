const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
  pageNumber: { type: Number, required: true },
  content: { type: String, required: true, maxLength: 500 },
  createdAt: { type: Date, default: Date.now },
});

commentSchema.index({ book: 1, pageNumber: 1 });
commentSchema.index({ user: 1, createdAt: 1 });
commentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Comment', commentSchema);
