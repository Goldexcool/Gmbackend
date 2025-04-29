const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
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
});

const conversationSchema = new mongoose.Schema({
  title: {
    type: String,
    default: 'New Conversation',
    trim: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  messages: [messageSchema],
  model: {
    type: String,
    default: 'gemini-1.5-flash'
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

// Add automatic title generation based on first message
conversationSchema.pre('save', function(next) {
  if (this.isNew && this.messages.length > 0 && (!this.title || this.title === 'New Conversation')) {
    // Extract first 5-8 words from the first message to create a title
    const firstMsg = this.messages[0].content;
    const words = firstMsg.split(' ');
    const titleWords = words.slice(0, Math.min(8, words.length));
    let autoTitle = titleWords.join(' ');
    
    // Truncate if too long and add ellipsis
    if (autoTitle.length > 60) {
      autoTitle = autoTitle.substring(0, 57) + '...';
    }
    
    this.title = autoTitle;
  }
  next();
});

const Conversation = mongoose.model('Conversation', conversationSchema);
module.exports = Conversation;