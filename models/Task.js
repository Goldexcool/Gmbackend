// models/Task.js
const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Please add a task name'],
    trim: true
  },
  dueDate: {
    type: Date,
    required: [true, 'Please add a due date']
  },
  status: {
    type: String,
    enum: ['open', 'completed', 'reopened'],
    default: 'open'
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Task', TaskSchema);