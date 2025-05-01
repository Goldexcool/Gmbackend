const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const courseResourceSchema = new Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
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
  resourceType: {
    type: String,
    enum: ['document', 'link', 'video', 'image', 'other'],
    default: 'document'
  },
  files: [{
    filename: String,
    fileUrl: String,
    mimeType: String,
    size: Number
  }],
  externalLink: {
    url: String,
    title: String
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  visibleToStudents: {
    type: Boolean,
    default: true
  },
  category: {
    type: String,
    default: 'General'
  },
  week: {
    type: Number
  },
  tags: [String],
  views: {
    type: Number,
    default: 0
  },
  downloads: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Create indexes for efficient queries
courseResourceSchema.index({ course: 1, academicSession: 1 });
courseResourceSchema.index({ lecturer: 1 });
courseResourceSchema.index({ visibleToStudents: 1 });
courseResourceSchema.index({ category: 1 });
courseResourceSchema.index({ week: 1 });
courseResourceSchema.index({ tags: 1 });

const CourseResource = mongoose.model('CourseResource', courseResourceSchema);
module.exports = CourseResource;