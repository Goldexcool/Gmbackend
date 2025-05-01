// models/Student.js
const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  matricNumber: {
    type: String,
    unique: true,
    sparse: true
  },
  program: {
    type: String,
    default: 'Undeclared'  // Provide a default value
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
  }],
  bio: {
    type: String,
    trim: true
  },
  interests: [String],
  birthDate: Date,
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    postalCode: String
  },
  emergencyContact: {
    name: String,
    relationship: String,
    phone: String,
    email: String
  },
  profilePicture: {
    filename: String,
    fileUrl: String,
    mimeType: String,
    size: Number
  },
  pendingUpdates: {
    department: String,
    level: String,
    matricNumber: String,
    requestedAt: Date,
    reviewedAt: Date,
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    notes: String
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Student', StudentSchema);