const mongoose = require('mongoose');

const ProfileViewSchema = new mongoose.Schema({
  viewer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  viewed: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  viewedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Create a compound index to ensure uniqueness and efficient querying
ProfileViewSchema.index({ viewer: 1, viewed: 1 }, { unique: true });

module.exports = mongoose.model('ProfileView', ProfileViewSchema);