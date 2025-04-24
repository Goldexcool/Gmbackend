// models/StudyGroup.js
const mongoose = require('mongoose');

const StudyGroupSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please add a title'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course'
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  chat: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('StudyGroup', StudyGroupSchema);