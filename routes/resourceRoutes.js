const express = require('express');
const router = express.Router();
const resourceController = require('../controllers/resourceController');
const { protect, authorize } = require('../middleware/authMiddleware');
const fileUpload = require('../middleware/fileUpload');

// Apply auth middleware to all routes
router.use(protect);
// Only allow students and lecturers (not admins) to access resources
router.use((req, res, next) => {
  if (req.user && (req.user.role === 'student' || req.user.role === 'lecturer')) {
    next();
  } else {
    res.status(403).json({
      success: false,
      message: 'Access denied. Only students and lecturers can access resources.'
    });
  }
});

// Routes for both students and lecturers
router.get('/search', resourceController.searchResources);
router.get('/:id', resourceController.getResourceDetail);
router.get('/:id/download', resourceController.downloadResource);

// Routes for lecturers only
router.post(
  '/',
  authorize('lecturer'),
  fileUpload.uploadFile('resource'),
  resourceController.uploadResource
);

// Route for students (with special processing for student uploads)
router.post(
  '/student-upload',
  authorize('student'),
  fileUpload.uploadFile('resource'),
  resourceController.studentUploadResource
);

// Routes for saving and rating resources
router.post('/:id/save', resourceController.saveResource);
router.post('/:id/rate', resourceController.rateResource);
router.post('/:id/share', resourceController.shareResource);

module.exports = router;