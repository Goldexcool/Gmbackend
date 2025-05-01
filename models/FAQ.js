const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const faqSchema = new Schema({
  question: {
    type: String,
    required: true,
    trim: true
  },
  answer: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['general', 'academic', 'technical', 'policy', 'other'],
    default: 'general'
  },
  audience: {
    type: [String],
    enum: ['student', 'lecturer', 'admin', 'all'],
    default: ['all']
  },
  order: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Create index for faster lookups
faqSchema.index({ category: 1, order: 1 });
faqSchema.index({ audience: 1 });
faqSchema.index({ isActive: 1 });

const FAQ = mongoose.model('FAQ', faqSchema);
module.exports = FAQ;