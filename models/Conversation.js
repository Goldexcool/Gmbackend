const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  title: String,
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  messages: [{
    role: String,
    content: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  connection: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Connection'
  },
  model: String,
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Remove any existing indexes on the connection field
// Note: This must come BEFORE creating the new index
ConversationSchema.indexes().forEach(index => {
  if (index[0].connection && Object.keys(index[0]).length === 1) {
    mongoose.model('Conversation')?.collection?.dropIndex(index[1])
      .catch(err => console.log('Note: Index may not exist yet, this is normal on first run'));
  }
});

// Now create the compound index
ConversationSchema.index({ user: 1, connection: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Conversation', ConversationSchema);