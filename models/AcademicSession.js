const mongoose = require('mongoose');

const AcademicSessionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name for the academic session'],
    trim: true
  },
  startDate: {
    type: Date,
    required: [true, 'Please provide a start date']
  },
  endDate: {
    type: Date,
    required: [true, 'Please provide an end date']
  },
  semesterType: {
    type: String,
    enum: ['first', 'second', 'third', 'summer'],
    required: [true, 'Please specify semester type']
  },
  registrationStart: Date,
  registrationEnd: Date,
  registrationOpen: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AcademicSession', AcademicSessionSchema);