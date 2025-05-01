const mongoose = require('mongoose');

const ConnectionSchema = new mongoose.Schema({
  requester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'blocked'],
    default: 'pending'
  },
  requestDate: {
    type: Date,
    default: Date.now
  },
  responseDate: Date,
  lastInteraction: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create a compound index to ensure uniqueness of connections
ConnectionSchema.index({ requester: 1, recipient: 1 }, { unique: true });

// Static method to check if users are connected
ConnectionSchema.statics.areConnected = async function(user1Id, user2Id) {
  const connection = await this.findOne({
    $or: [
      { requester: user1Id, recipient: user2Id, status: 'accepted' },
      { requester: user2Id, recipient: user1Id, status: 'accepted' }
    ]
  });
  
  return connection ? true : false;
};

module.exports = mongoose.model('Connection', ConnectionSchema);