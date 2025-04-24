// models/Course.js
const mongoose = require('mongoose');

const CourseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a course name'],
    trim: true
  },
  code: {
    type: String,
    required: [true, 'Please add a course code'],
    unique: true,
    trim: true
  },
  lecturers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lecturer'
  }],
  students: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student'
  }],
  schedule: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Schedule'
  }],
  resources: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Resource'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Course', CourseSchema);