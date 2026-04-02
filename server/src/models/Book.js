const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: { type: String, required: true },
  description: String,
  coverUrl: String,
  format: {
    type: String,
    enum: ['mini', 'pro', 'ultra'],
    default: 'mini',
  },
  pages: [{
    pageNumber: Number,
    content: String,
    imageUrl: String,
  }],
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
});

bookSchema.index({ title: 1 });
bookSchema.index({ author: 1 });

module.exports = mongoose.model('Book', bookSchema);
