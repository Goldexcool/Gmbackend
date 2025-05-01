const mongoose = require('mongoose');

const CourseRepChatSchema = new mongoose.Schema({
  courseRep: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CourseRep',
    required: true
  },
  lecturer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lecturer',
    required: true
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  messages: [{
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    senderRole: {
      type: String,
      enum: ['lecturer', 'course_rep'],
      required: true
    },
    text: {
      type: String,
      required: true
    },
    attachments: [{
      url: String,
      filename: String,
      mimeType: String,
      size: Number,
      isImage: Boolean,
      isVideo: Boolean,
      isDocument: Boolean
    }],
    read: {
      type: Boolean,
      default: false
    },
    readAt: Date,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  lastMessage: {
    text: String,
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    read: {
      type: Boolean,
      default: false
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Create a compound index for the lecturer and course rep
CourseRepChatSchema.index({ lecturer: 1, courseRep: 1 }, { unique: true });

module.exports = mongoose.model('CourseRepChat', CourseRepChatSchema);