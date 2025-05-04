const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CourseSchema = new Schema({
  title: {
    type: String,
    required: [true, 'Please add a course title'],
    trim: true
  },
  code: {
    type: String,
    required: [true, 'Please add a course code'],
    unique: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  department: {
    type: mongoose.Schema.Types.Mixed, // Accept both ObjectId and String
    required: [true, 'Please specify the department'],
    // This will handle both cases:
    // 1. When it's an ObjectId - use it for population
    // 2. When it's a string - just display it as a name
    validate: {
      validator: function(v) {
        // Accept either ObjectId or String
        return mongoose.Types.ObjectId.isValid(v) || (typeof v === 'string' && v.trim().length > 0);
      },
      message: props => `${props.value} is not a valid department ID or name`
    }
  },
  level: {
    type: String,
    required: [true, 'Please specify the level']
  },
  credits: {
    type: Number,
    required: [true, 'Please specify the credit units']
  },
  semester: {
    type: String,
    required: [true, 'Please specify the semester'],
    enum: ['First', 'Second', 'Summer']
  },
  academicSession: {
    type: Schema.Types.ObjectId,
    ref: 'AcademicSession',
    required: [true, 'Please specify the academic session']
  },
  lecturer: [{  // Changed to array to support multiple lecturers
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lecturer'
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  isCompulsory: {
    type: Boolean,
    default: false
  },
  sessionHistory: [{
    session: {
      type: Schema.Types.ObjectId,
      ref: 'AcademicSession'
    },
    semester: String,
    lecturers: [{
      type: Schema.Types.ObjectId,
      ref: 'Lecturer'
    }],
    enrollmentCount: {
      type: Number,
      default: 0
    }
  }]
}, { timestamps: true });

// Virtual for creditHours that returns the value of credits
CourseSchema.virtual('creditHours').get(function() {
  return this.credits;
});

// You might also want to allow setting credits through creditHours
CourseSchema.virtual('creditHours').set(function(value) {
  this.credits = value;
});

CourseSchema.set('toObject', { virtuals: true });
CourseSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Course', CourseSchema);