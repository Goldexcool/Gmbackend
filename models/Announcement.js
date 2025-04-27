const mongoose = require('mongoose');

const AnnouncementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please provide a title'],
    trim: true
  },
  body: {
    type: String,
    required: [true, 'Please provide announcement body']
  },
  audience: {
    type: String,
    enum: ['all', 'students', 'lecturers', 'admins'],
    default: 'all'
  },
  expiresAt: {
    type: Date
  },
  isImportant: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Announcement', AnnouncementSchema);