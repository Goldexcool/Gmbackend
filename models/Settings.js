const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema({
  siteName: {
    type: String,
    default: 'GemSpace'
  },
  siteDescription: {
    type: String,
    default: 'Educational Platform'
  },
  contactEmail: String,
  supportPhone: String,
  maintenanceMode: {
    type: Boolean,
    default: false
  },
  registrationOpen: {
    type: Boolean,
    default: true
  },
  maxCourseEnrollment: {
    type: Number,
    default: 8
  },
  defaultTheme: {
    type: String,
    default: 'light'
  },
  logoUrl: String,
  faviconUrl: String,
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Settings', SettingsSchema);