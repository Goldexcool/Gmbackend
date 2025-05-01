// models/Course.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const courseSchema = new Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  creditHours: {
    type: Number,
    required: true,
    default: 3
  },
  department: {
    type: String,
    required: true,
    trim: true
  },
  level: {
    type: String,
    required: true,
    enum: ['100', '200', '300', '400', '500', 'Graduate']
  },
  academicSession: {
    type: Schema.Types.ObjectId,
    ref: 'AcademicSession',
    required: true
  },
  semester: {
    type: String,
    required: true,
    enum: ['First', 'Second', 'Both'],
    set: function(val) {
      // Convert numeric values to strings
      if (val === 1 || val === '1') return 'First';
      if (val === 2 || val === '2') return 'Second';
      return val;
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lecturer: [{
    type: Schema.Types.ObjectId,
    ref: 'Lecturer'
  }],
  sessionHistory: [{
    session: {
      type: Schema.Types.ObjectId,
      ref: 'AcademicSession'
    },
    semester: {
      type: String,
      enum: ['First', 'Second', 'Both']
    },
    lecturers: [{
      type: Schema.Types.ObjectId,
      ref: 'Lecturer'
    }],
    enrollmentCount: {
      type: Number,
      default: 0
    }
  }],
  courseRep: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student'
  }
}, { timestamps: true });

courseSchema.index({ academicSession: 1, level: 1 });
courseSchema.index({ department: 1, academicSession: 1 });

courseSchema.pre('save', async function(next) {
  if (this.isModified('lecturer') || this.isNew) {
    const hasMatchingEntry = this.sessionHistory.some(entry => 
      entry.session.toString() === this.academicSession.toString() && 
      entry.semester === this.semester
    );
    
    if (!hasMatchingEntry) {
      const Student = mongoose.model('Student');
      let enrollmentCount = 0;
      
      try {
        enrollmentCount = await Student.countDocuments({ 
          courses: this._id,
          isActive: true 
        });
      } catch (err) {
        console.error('Error counting enrollments:', err);
      }
      
      this.sessionHistory.push({
        session: this.academicSession,
        semester: this.semester,
        lecturers: this.lecturer,
        enrollmentCount
      });
    } else {
      const entryIndex = this.sessionHistory.findIndex(entry => 
        entry.session.toString() === this.academicSession.toString() && 
        entry.semester === this.semester
      );
      
      if (entryIndex !== -1) {
        this.sessionHistory[entryIndex].lecturers = this.lecturer;
      }
    }
  }
  
  next();
});

const Course = mongoose.model('Course', courseSchema);
module.exports = Course;