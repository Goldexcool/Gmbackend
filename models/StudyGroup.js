const mongoose = require('mongoose');

const StudyGroupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a group name'],
    trim: true,
    maxlength: [100, 'Group name cannot be more than 100 characters']
  },
  description: {
    type: String,
    maxlength: [500, 'Description cannot be more than 500 characters']
  },
  avatar: {
    type: String,
    default: 'default-group.png'
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course'
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  },
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['admin', 'moderator', 'member'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  invitations: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    invitedAt: {
      type: Date,
      default: Date.now
    }
  }],
  joinRequests: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    requestedAt: {
      type: Date,
      default: Date.now
    },
    message: String
  }],
  isPrivate: {
    type: Boolean,
    default: false
  },
  tags: [String],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Add a text index for search
StudyGroupSchema.index({ 
  name: 'text', 
  description: 'text',
  tags: 'text'
});

// Method to check if a user is a member
StudyGroupSchema.methods.isMember = function(userId) {
  return this.members.some(member => 
    member.user.toString() === userId.toString()
  );
};

// Method to check if a user is an admin
StudyGroupSchema.methods.isAdmin = function(userId) {
  const member = this.members.find(member => 
    member.user.toString() === userId.toString()
  );
  
  return member && member.role === 'admin';
};

// Method to check if a user is a moderator or admin
StudyGroupSchema.methods.canModerate = function(userId) {
  const member = this.members.find(member => 
    member.user.toString() === userId.toString()
  );
  
  return member && (member.role === 'admin' || member.role === 'moderator');
};

module.exports = mongoose.model('StudyGroup', StudyGroupSchema);