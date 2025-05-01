const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const submissionSchema = new Schema({
  student: {
    type: Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  files: [{
    filename: String,
    fileUrl: String,
    mimeType: String,
    size: Number
  }],
  comments: {
    type: String
  },
  grade: {
    score: Number,
    feedback: String,
    gradedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Lecturer'
    },
    gradedAt: Date
  },
  status: {
    type: String,
    enum: ['submitted', 'late', 'graded', 'returned'],
    default: 'submitted'
  }
});

// Main Assignment Schema
const assignmentSchema = new Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  course: {
    type: Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  academicSession: {
    type: Schema.Types.ObjectId,
    ref: 'AcademicSession',
    required: true
  },
  lecturer: {
    type: Schema.Types.ObjectId,
    ref: 'Lecturer',
    required: true
  },
  dueDate: {
    type: Date,
    required: true
  },
  totalPoints: {
    type: Number,
    default: 100
  },
  files: [{
    filename: String,
    fileUrl: String,
    mimeType: String,
    size: Number
  }],
  submissions: [submissionSchema],
  isPublished: {
    type: Boolean,
    default: true
  },
  publishedAt: {
    type: Date
  },
  allowLateSubmission: {
    type: Boolean,
    default: false
  },
  latePenalty: {
    type: Number,
    default: 0, // Percentage deduction for late submissions
    min: 0,
    max: 100
  },
  instructions: {
    type: String
  },
  visibleToStudents: {
    type: Boolean,
    default: true
  },
  submissionType: {
    type: String,
    enum: ['file', 'text', 'both'],
    default: 'file'
  },
  gradingScheme: {
    type: String,
    enum: ['points', 'percentage', 'letter'],
    default: 'points'
  }
}, { timestamps: true });

// Indexes for efficient queries
assignmentSchema.index({ course: 1, academicSession: 1 });
assignmentSchema.index({ lecturer: 1, academicSession: 1 });
assignmentSchema.index({ dueDate: 1 });

const Assignment = mongoose.model('Assignment', assignmentSchema);
module.exports = Assignment;