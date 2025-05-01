const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const departmentSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  code: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    unique: true
  },
  faculty: {
    type: Schema.Types.ObjectId,
    ref: 'Faculty',
    required: false
  },
  headOfDepartment: {
    type: Schema.Types.ObjectId,
    ref: 'Lecturer'
  },
  description: {
    type: String,
    trim: true
  },
  courses: [{
    type: Schema.Types.ObjectId,
    ref: 'Course'
  }],
  lecturers: [{
    type: Schema.Types.ObjectId,
    ref: 'Lecturer'
  }],
  students: [{
    type: Schema.Types.ObjectId,
    ref: 'Student'
  }],
  contactInfo: {
    email: String,
    phone: String,
    office: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  academicLevels: {
    type: [Number],
    default: [100, 200, 300, 400]
  }
}, {
  timestamps: true
});

// Create indexes for better query performance
departmentSchema.index({ name: 1 });
departmentSchema.index({ code: 1 });
departmentSchema.index({ faculty: 1 });

const Department = mongoose.model('Department', departmentSchema);
module.exports = Department;