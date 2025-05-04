const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const resourceSchema = new Schema({
  title: {
    type: String,
    required: [true, 'Please add a title'],
    trim: true,
    maxlength: [100, 'Title cannot be more than 100 characters']
  },
  description: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    required: [true, 'Please specify a category'],
    enum: ['lecture', 'assignment', 'tutorial', 'reference', 'other', "lecture notes", "past questions", "course outline", "course material", "project", "research paper", "presentation", "video", "audio"],
  },
  course: {
    type: Schema.Types.ObjectId,
    ref: 'Course'
  },
  visibility: {
    type: String,
    enum: ['public', 'course', 'department', 'private', ],
    default: 'public'
  },
  files: [{
    filename: String,
    fileUrl: String,
    filePath: String,
    fileType: String,
    fileSize: Number,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  tags: [{
    type: String,
    trim: true
  }],
  uploadedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isApproved: {
    type: Boolean,
    default: false
  },
  pendingApproval: {
    type: Boolean,
    default: false
  },
  approvedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  approvalDate: {
    type: Date
  },
  ratings: [{
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true
    },
    review: {
      type: String
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }],
  averageRating: {
    type: Number,
    default: 0
  },
  views: {
    type: Number,
    default: 0
  },
  downloads: {
    type: Number,
    default: 0
  },
  shares: {
    type: Number,
    default: 0
  },
  restrictedTo: {
    departments: [{
      type: Schema.Types.ObjectId,
      ref: 'Department'
    }],
    level: Number
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for faster queries
resourceSchema.index({ title: 'text', description: 'text', tags: 'text' });
resourceSchema.index({ uploadedBy: 1 });
resourceSchema.index({ course: 1 });
resourceSchema.index({ category: 1 });
resourceSchema.index({ 'restrictedTo.departments': 1 });
resourceSchema.index({ 'restrictedTo.level': 1 });
resourceSchema.index({ createdAt: -1 });

// Virtual for download URL
resourceSchema.virtual('downloadUrl').get(function() {
  if (this.files && this.files.length > 0) {
    return `/api/resources/${this._id}/download`;
  }
  return null;
});

// Pre-save hook to update average rating
resourceSchema.pre('save', function(next) {
  if (this.ratings && this.ratings.length > 0) {
    const total = this.ratings.reduce((sum, rating) => sum + rating.rating, 0);
    this.averageRating = (total / this.ratings.length).toFixed(1);
  }
  next();
});

module.exports = mongoose.model('Resource', resourceSchema);