const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  connection: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Connection',
    sparse: true
  },
  lastMessage: {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    text: String,
    read: Boolean,
    timestamp: Date
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Conversation', ConversationSchema);