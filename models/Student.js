// models/Student.js
const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  // Change from regNumber to matricNumber to match your database
  matricNumber: {
    type: String,
    // Remove unique constraint or make it sparse to allow multiple null values
    sparse: true  // This allows multiple documents with null/undefined values
  },
  department: String,
  faculty: String,
  level: {
    type: Number,
    enum: [100, 200, 300, 400, 500, 600],
    default: 100
  },
  semester: {
    type: String,
    enum: ['first', 'second'],
    default: 'first'
  },
  courses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course'
  }],
  connections: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending'
    }
  }],
  completedAssignments: [{
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assignment'
    },
    grade: Number,
    submittedAt: Date,
    feedback: String
  }],
  attendance: [{
    date: Date,
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course'
    },
    present: Boolean
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('Student', StudentSchema);