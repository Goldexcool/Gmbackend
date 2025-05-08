const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  title: {
    type: String,
    required: true
  },
  // Add conversationType to distinguish between AI and peer conversations
  conversationType: {
    type: String,
    enum: ['ai', 'peer'],
    default: 'ai'
  },
  // AI model - only relevant for AI conversations
  model: {
    type: String,
    default: 'gemini-1.5-flash'
  },
  messages: [{
    // Sender can be null for system messages
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    // Role field for AI conversations
    role: {
      type: String,
      enum: ['user', 'assistant', 'system']
    },
    content: {
      type: String,
      required: true
    },
    // Add message type to support different content types
    messageType: {
      type: String,
      enum: ['text', 'image', 'file', 'resource'],
      default: 'text'
    },
    // For file/resource messages
    attachment: {
      fileUrl: String,
      fileName: String,
      fileType: String,
      resourceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Resource'
      }
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    read: {
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
    }]
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  // For peer conversations - course context
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Check if conversation is between two users
ConversationSchema.statics.findBetweenUsers = async function(user1Id, user2Id) {
  return this.findOne({
    participants: { $all: [user1Id, user2Id] },
    isActive: true
  });
};

module.exports = mongoose.model('Conversation', ConversationSchema);