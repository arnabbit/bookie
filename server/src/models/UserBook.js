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
});

userBookSchema.index({ userId: 1, bookId: 1 }, { unique: true });

module.exports = mongoose.model('UserBook', userBookSchema);
