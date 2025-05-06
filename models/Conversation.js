const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  // User who owns this conversation (for AI chats)
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // For peer-to-peer conversations
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Title of the conversation
  title: {
    type: String,
    default: 'New Conversation'
  },
  // AI model used (for AI conversations)
  model: {
    type: String,
    default: 'gpt-3.5-turbo'
  },
  // Messages in the conversation
  messages: [{
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User' 
    },
    isAI: {
      type: Boolean,
      default: false
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
  }],
  // Last message for quick display
  lastMessage: {
    sender: mongoose.Schema.Types.ObjectId,
    text: String,
    timestamp: Date,
    read: Boolean
  },
  // Related connection (for peer-to-peer)
  connection: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Connection'
  },
  // Is the conversation active
  isActive: {
    type: Boolean,
    default: true
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