const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const resourceLibrarySchema = new Schema({
  title: {
    type: String,
    required: [true, 'Please add a title'],
    trim: true,
    index: 'text'
  },
  description: {
    type: String,
    trim: true,
    index: 'text'
  },
  resourceType: {
    type: String,
    enum: ['textbook', 'journal', 'article', 'notes', 'video', 'lecture_notes', 
           'past_papers', 'quiz', 'tutorial', 'reference', 'other'],
    required: true,
    index: true
  },
  format: {
    type: String,
    enum: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'mp4', 'mp3', 'jpg', 'png', 'html', 'link'],
    required: true
  },
  author: {
    type: String,
    trim: true,
    index: 'text'
  },
  publisher: {
    type: String,
    trim: true
  },
  publicationYear: Number,
  edition: String,
  isbn: {
    type: String,
    sparse: true,
    index: true
  },
  language: {
    type: String,
    default: 'English'
  },
  tags: [{
    type: String,
    trim: true
  }],
  subjects: [{
    type: Schema.Types.ObjectId,
    ref: 'Course',
    index: true
  }],
  departments: [{
    type: Schema.Types.ObjectId, 
    ref: 'Department',
    index: true
  }],
  level: {
    type: Number,
    enum: [100, 200, 300, 400, 500, 600, 0], // 0 for general resources
    index: true
  },
  fileUrl: {
    type: String
  },
  externalLink: {
    type: String,
    validate: {
      validator: function(v) {
        return !this.fileUrl || /^(http|https):\/\/[^ "]+$/.test(v);
      },
      message: props => `${props.value} is not a valid URL!`
    }
  },
  thumbnail: {
    type: String
  },
  uploadedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  // For publicly available resources
  source: {
    name: String,
    url: String,
    apiRef: String
  },
  accessLevel: {
    type: String,
    enum: ['public', 'department', 'level', 'course', 'private'],
    default: 'public',
    index: true
  },
  // Statistics
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
  ratings: [{
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    review: String,
    date: {
      type: Date,
      default: Date.now
    }
  }],
  averageRating: {
    type: Number,
    default: 0
  },
  // For moderation
  isApproved: {
    type: Boolean,
    default: true,
    index: true
  },
  approvedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  isFeatured: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for full text search
resourceLibrarySchema.index({ 
  title: 'text', 
  description: 'text',
  author: 'text',
  tags: 'text'
});

// Virtual for average rating
resourceLibrarySchema.virtual('ratingStats').get(function() {
  if (this.ratings && this.ratings.length > 0) {
    const total = this.ratings.reduce((sum, rating) => sum + rating.rating, 0);
    return {
      average: (total / this.ratings.length).toFixed(1),
      count: this.ratings.length
    };
  }
  return { average: 0, count: 0 };
});

// Pre-save hook to update average rating
resourceLibrarySchema.pre('save', function(next) {
  if (this.ratings && this.ratings.length > 0) {
    const total = this.ratings.reduce((sum, rating) => sum + rating.rating, 0);
    this.averageRating = (total / this.ratings.length).toFixed(1);
  }
  next();
});

module.exports = mongoose.model('ResourceLibrary', resourceLibrarySchema);