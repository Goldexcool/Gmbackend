// models/Lecturer.js
const mongoose = require('mongoose');

const LecturerSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  lecturerId: {
    type: String,
    unique: true,
    default: function() {
      return 'LECT-' + Date.now().toString().slice(-6) + '-' + 
        Math.random().toString(36).substring(2, 6).toUpperCase();
    }
  },
  staffId: {
    type: String,
    unique: true,
    sparse: true,
  },
  department: String,
  college: String,
  specialization: String, 
  specialty: String,
  courses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course'
  }],
  officeHours: {
    type: mongoose.Schema.Types.Mixed, // Can be string or array
    default: []
  },
  currentlyTeaching: {
    type: Boolean,
    default: true
  },
  publications: [{
    title: String,
    journal: String,
    year: Number,
    link: String
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('Lecturer', LecturerSchema);