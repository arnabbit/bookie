const mongoose = require('mongoose');

const userBookSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
  format: {
    type: String,
    enum: ['mini', 'pro', 'ultra'],
    required: true,
  },
  addedAt: { type: Date, default: Date.now },
  // Per-(user, book) reading progress. Position is 0-based page index.
  lastPage: { type: Number, default: 0 },
  startedAt: { type: Date, default: Date.now },
  finishedAt: { type: Date, default: null },
});

userBookSchema.index({ userId: 1, bookId: 1 }, { unique: true });

module.exports = mongoose.model('UserBook', userBookSchema);
