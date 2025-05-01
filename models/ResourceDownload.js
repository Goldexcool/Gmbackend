const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const resourceDownloadSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  resource: {
    type: Schema.Types.ObjectId,
    ref: 'Resource',
    required: true
  },
  downloadDate: {
    type: Date,
    default: Date.now
  },
  deviceInfo: {
    type: String
  },
  ipAddress: {
    type: String
  }
}, {
  timestamps: true
});

// Index for quick lookups
resourceDownloadSchema.index({ user: 1, resource: 1 });
resourceDownloadSchema.index({ downloadDate: -1 });

module.exports = mongoose.model('ResourceDownload', resourceDownloadSchema);