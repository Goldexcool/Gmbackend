const mongoose = require('mongoose');

const CourseRepSchema = new mongoose.Schema({
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lecturer',
    required: true
  },
  assignedAt: {
    type: Date,
    default: Date.now
  },
  responsibilities: [String],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Create a compound index to ensure uniqueness
CourseRepSchema.index({ course: 1 }, { unique: true });

module.exports = mongoose.model('CourseRep', CourseRepSchema);