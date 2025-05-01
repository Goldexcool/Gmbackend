const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const courseRepresentativeSchema = new Schema({
  student: {
    type: Schema.Types.ObjectId,
    ref: 'Student',
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
  assignedBy: {
    type: Schema.Types.ObjectId,
    ref: 'Lecturer',
    required: true
  },
  assignedAt: {
    type: Date,
    default: Date.now
  },
  responsibilities: {
    type: [String],
    default: [
      'Communicate between students and lecturer',
      'Coordinate class activities', 
      'Report issues to department'
    ]
  },
  contactInfo: {
    email: String,
    phone: String
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

// Ensure uniqueness - one representative per course per session
courseRepresentativeSchema.index(
  { course: 1, academicSession: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

const CourseRepresentative = mongoose.model('CourseRepresentative', courseRepresentativeSchema);
module.exports = CourseRepresentative;