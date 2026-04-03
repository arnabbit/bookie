const mongoose = require('mongoose');

const pageSchema = new mongoose.Schema({
  pageNumber: Number,
  content: String,
  imageUrl: String,
}, { _id: false });

const bookSchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: { type: String, required: true },
  coverUrl: String,
  summary: { type: String, default: '' },
  formats: {
    mini: [pageSchema],
    pro: [pageSchema],
    ultra: [pageSchema],
  },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
});

bookSchema.index({ title: 1, author: 1 });

module.exports = mongoose.model('Book', bookSchema);
