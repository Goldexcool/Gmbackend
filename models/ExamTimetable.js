const mongoose = require('mongoose');

const examSessionSchema = new mongoose.Schema({
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  startTime: {
    type: String,
    required: true,
    // Validate time format (HH:MM)
    validate: {
      validator: function(v) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: props => `${props.value} is not a valid time format! Use HH:MM format.`
    }
  },
  endTime: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: props => `${props.value} is not a valid time format! Use HH:MM format.`
    }
  },
  venue: {
    type: String,
    required: true
  },
  invigilators: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lecturer'
  }],
  notes: {
    type: String,
    default: ''
  }
});

const examTimetableSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  academicSession: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicSession',
    required: true
  },
  semester: {
    type: String,
    required: true,
    enum: ['First', 'Second']
  },
  examType: {
    type: String,
    required: true,
    enum: ['Mid-Semester', 'End-Semester', 'Supplementary', 'Special']
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  sessions: [examSessionSchema],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  publishedAt: {
    type: Date
  }
}, { timestamps: true });

// Validate that endDate is after startDate
examTimetableSchema.pre('validate', function(next) {
  if (this.endDate < this.startDate) {
    this.invalidate('endDate', 'End date must be after start date');
  }
  next();
});

const ExamTimetable = mongoose.model('ExamTimetable', examTimetableSchema);
module.exports = ExamTimetable;