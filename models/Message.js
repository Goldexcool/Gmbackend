const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: [true, 'Message cannot be empty']
  },
  attachments: [{
    url: String,
    mimeType: String,
    filename: String
  }],
  read: {
    type: Boolean,
    default: false
  },
  readAt: Date
}, {
  timestamps: true
});

// Update conversation lastMessage when a new message is created
MessageSchema.pre('save', async function(next) {
  if (this.isNew) {
    try {
      await mongoose.model('Conversation').findByIdAndUpdate(
        this.conversation,
        {
          lastMessage: {
            text: this.text,
            sender: this.sender,
            timestamp: this.createdAt || Date.now(),
            read: false
          }
        }
      );
    } catch (error) {
      console.error('Error updating conversation with last message:', error);
    }
  }
  next();
});

module.exports = mongoose.model('Message', MessageSchema);

