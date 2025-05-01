// models/Task.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const taskSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  dueDate: {
    type: Date,
    required: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'completed', 'canceled', 'overdue'],
    default: 'pending'
  },
  category: {
    type: String,
    enum: ['teaching', 'research', 'administrative', 'personal', 'other'],
    default: 'teaching'
  },
  relatedCourse: {
    type: Schema.Types.ObjectId,
    ref: 'Course'
  },
  completedAt: {
    type: Date
  },
  reminderDate: {
    type: Date
  },
  tags: [String],
  attachments: [{
    filename: String,
    fileUrl: String,
    mimeType: String,
    size: Number
  }]
}, {
  timestamps: true
});

// Pre-save middleware to automatically set status to overdue if past due date
taskSchema.pre('save', function(next) {
  // If task is already completed or canceled, don't change status
  if (this.status === 'completed' || this.status === 'canceled') {
    next();
    return;
  }
  
  // Check if task is overdue
  if (this.dueDate && new Date() > this.dueDate) {
    this.status = 'overdue';
  }
  
  next();
});

// Create indexes for efficient queries
taskSchema.index({ user: 1, status: 1 });
taskSchema.index({ user: 1, dueDate: 1 });
taskSchema.index({ user: 1, priority: 1 });
taskSchema.index({ relatedCourse: 1 });

const Task = mongoose.model('Task', taskSchema);
module.exports = Task;