const mongoose = require('mongoose');

const academicSessionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name for the academic session'],
    trim: true
  },
  year: {
    type: String,
    required: [true, 'Please provide the academic year'],
    trim: true,
    unique: true
  },
  startDate: {
    type: Date,
    required: [true, 'Please provide a start date']
  },
  endDate: {
    type: Date,
    required: [true, 'Please provide an end date']
  },
  isActive: {
    type: Boolean,
    default: false
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  semesters: [{
    name: String,
    startDate: Date,
    endDate: Date
  }]
}, { timestamps: true });

// Validate endDate > startDate
academicSessionSchema.pre('validate', function(next) {
  if (this.endDate <= this.startDate) {
    this.invalidate('endDate', 'End date must be after start date');
  }
  next();
});

// Helper method to get current/most recent session
academicSessionSchema.statics.getCurrent = async function() {
  const session = await this.findOne({ isActive: true }).sort({ year: -1, createdAt: -1 });
  if (!session) {
    // If no active session, get most recent by year
    return this.findOne().sort({ year: -1, createdAt: -1 });
  }
  return session;
};

const AcademicSession = mongoose.model('AcademicSession', academicSessionSchema);
module.exports = AcademicSession;