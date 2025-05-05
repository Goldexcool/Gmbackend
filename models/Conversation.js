const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  // For AI Conversations
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // For Connection Conversations (between users)
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  title: {
    type: String,
    default: 'New Conversation'
  },
  // For AI conversations
  model: {
    type: String,
    default: 'gemini-1.5-flash'
  },
  // For AI conversations
  messages: [{
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true
    },
    content: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  // For connection messages (between users)
  lastMessage: {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    text: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    read: {
      type: Boolean,
      default: false
    }
  },
  // Reference to related connection if applicable
  connection: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Connection'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Conversation', ConversationSchema);