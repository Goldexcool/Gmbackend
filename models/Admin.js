const mongoose = require('mongoose');

const AdminSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  department: {
    type: String
  },
  position: {
    type: String
  },
  permissions: {
    manageUsers: {
      type: Boolean,
      default: true
    },
    manageCourses: {
      type: Boolean,
      default: true
    },
    manageResources: {
      type: Boolean,
      default: true
    },
    viewAnalytics: {
      type: Boolean,
      default: true
    },
    sendNotifications: {
      type: Boolean,
      default: true
    }
  },
  lastActive: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Admin', AdminSchema);