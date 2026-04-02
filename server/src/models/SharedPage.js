const mongoose = require('mongoose');

const sharedPageSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
  pageNumber: { type: Number, required: true },
  content: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

sharedPageSchema.index({ to: 1, createdAt: -1 });
sharedPageSchema.index({ from: 1, to: 1 });

module.exports = mongoose.model('SharedPage', sharedPageSchema);
