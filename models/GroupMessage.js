const mongoose = require('mongoose');

const GroupMessageSchema = new mongoose.Schema({
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudyGroup',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    default: ''
  },
  attachments: [{
    url: String,
    filename: String,
    mimeType: String,
    size: Number,
    isImage: Boolean,
    isVideo: Boolean,
    isDocument: Boolean,
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ResourceLibrary'
    },
    title: String,
    type: String,
    isImage: {
      type: Boolean,
      default: false
    },
    isVideo: {
      type: Boolean,
      default: false
    },
    isDocument: {
      type: Boolean, 
      default: false
    }
  }],
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GroupMessage'
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  isAnnouncement: {
    type: Boolean,
    default: false
  },
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  edited: {
    type: Boolean,
    default: false
  },
  editHistory: [{
    text: String,
    editedAt: Date
  }]
}, {
  timestamps: true
});

// Create a compound index for efficient queries
GroupMessageSchema.index({ group: 1, createdAt: -1 });

module.exports = mongoose.model('GroupMessage', GroupMessageSchema);