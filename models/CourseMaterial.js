const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const courseMaterialSchema = new Schema({
  title: {
    type: String,
    required: [true, 'Material title is required'],
    trim: true
  },
  description: {
    type: String,
    default: ''
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
  materialType: {
    type: String,
    enum: ['lecture_note', 'slide', 'reference', 'syllabus', 'exercise', 'other'],
    default: 'lecture_note'
  },
  file: {
    filename: String,
    fileUrl: String,
    mimeType: String,
    size: Number,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  },
  topic: {
    type: String
  },
  weekNumber: {
    type: Number
  },
  uploadedBy: {
    type: Schema.Types.ObjectId,
    ref: 'Lecturer',
    required: true
  },
  visibleToStudents: {
    type: Boolean,
    default: true
  },
  downloadCount: {
    type: Number,
    default: 0
  },
  tags: [{
    type: String
  }]
}, { timestamps: true });

// Indexes
courseMaterialSchema.index({ course: 1, academicSession: 1, materialType: 1 });
courseMaterialSchema.index({ uploadedBy: 1 });

const CourseMaterial = mongoose.model('CourseMaterial', courseMaterialSchema);
module.exports = CourseMaterial;