// models/Chat.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const messageSchema = new Schema({
  sender: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  readBy: [{
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  attachments: [{
    filename: String,
    fileUrl: String,
    mimeType: String,
    size: Number
  }]
});

const chatSchema = new Schema({
  participants: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  messages: [messageSchema],
  lastMessage: {
    content: String,
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  isGroupChat: {
    type: Boolean,
    default: false
  },
  groupName: {
    type: String,
    trim: true
  },
  groupAdmin: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  courseContext: {
    type: Schema.Types.ObjectId,
    ref: 'Course'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for faster queries
chatSchema.index({ participants: 1 });
chatSchema.index({ 'lastMessage.timestamp': -1 });
chatSchema.index({ courseContext: 1 });

const Chat = mongoose.model('Chat', chatSchema);
module.exports = Chat;