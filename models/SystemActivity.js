const mongoose = require('mongoose');

const SystemActivitySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    required: true
  },
  details: {
    type: String,
    required: true
  },
  affectedModel: {
    type: String,
    required: true
  },
  affectedId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('SystemActivity', SystemActivitySchema);