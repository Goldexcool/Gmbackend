const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const savedResourceSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  resource: {
    type: Schema.Types.ObjectId,
    ref: 'Resource',
    required: true
  },
  savedAt: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    default: ''
  },
  folder: {
    type: String,
    default: 'General'
  },
  tags: [{
    type: String
  }]
}, {
  timestamps: true
});

// Compound index to ensure a user can save a resource only once
savedResourceSchema.index({ user: 1, resource: 1 }, { unique: true });

module.exports = mongoose.model('SavedResource', savedResourceSchema);