// models/Lecturer.js
const mongoose = require('mongoose');

const LecturerSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  staffId: {
    type: String,
    unique: true,
    sparse: true
  },
  department: String,
  college: String,
  specialty: String,
  courses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course'
  }],
  officeHours: [{
    day: String,
    startTime: String,
    endTime: String,
    location: String
  }],
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