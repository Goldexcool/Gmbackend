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

// Drop the existing compound index
mongoose.connection.once('open', async () => {
  try {
    await mongoose.connection.db.collection('conversations').dropIndex('user_1_connection_1');
    console.log('Dropped compound index');
  } catch (error) {
    // Index might not exist yet, which is fine
    console.log('Note: compound index may not exist yet');
  }
});

// Create a single-field sparse unique index on connection
// This only enforces uniqueness for non-null values
ConversationSchema.index({ connection: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Conversation', ConversationSchema);