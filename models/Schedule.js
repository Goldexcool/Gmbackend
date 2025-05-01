// models/Schedule.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const scheduleSchema = new Schema({
  course: {
    type: Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  lecturer: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  time: {
    type: String,
    required: true
  },
  venue: {
    type: String,
    required: true
  },
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurrencePattern: {
    type: String,
    enum: ['daily', 'weekly', 'biweekly', 'monthly', 'none'],
    default: 'none'
  },
  academicSession: {
    type: Schema.Types.ObjectId,
    ref: 'AcademicSession'
  },
  status: {
    type: String,
    enum: ['scheduled', 'canceled', 'rescheduled', 'completed'],
    default: 'scheduled'
  },
  notes: {
    type: String
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Create indexes for efficient queries
scheduleSchema.index({ course: 1, date: 1 });
scheduleSchema.index({ lecturer: 1, date: 1 });
scheduleSchema.index({ academicSession: 1 });
scheduleSchema.index({ date: 1, status: 1 });

const Schedule = mongoose.model('Schedule', scheduleSchema);
module.exports = Schedule;