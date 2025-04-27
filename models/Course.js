// models/Course.js
const mongoose = require('mongoose');

const CourseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a course name']
  },
  title: {
    type: String
  },
  code: {
    type: String,
    required: [true, 'Please add a course code'],
    unique: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  department: {
    type: String,
    required: [true, 'Please specify a department']
  },
  college: {
    type: String
  },
  level: {
    type: Number,
    default: 100
  },
  semester: {
    type: Number,
    default: 1,
    enum: [1, 2, 3] // Some schools have 3 semesters
  },
  credits: {
    type: Number,
    default: 3
  },
  capacity: {
    type: Number,
    default: 50
  },
  enrolledStudents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  assignedLecturers: [{ // This field is missing in your schema
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  prerequisites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course'
  }],
  syllabus: String,
  schedule: {
    days: [String],
    startTime: String,
    endTime: String,
    venue: String
  },
  materials: [{
    title: String,
    type: String,
    url: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Course', CourseSchema);