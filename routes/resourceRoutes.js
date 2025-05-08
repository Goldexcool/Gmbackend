const express = require('express');
const router = express.Router();
const resourceController = require('../controllers/resourceController');
const { protect, authorize } = require('../middleware/authMiddleware');
const fileUpload = require('../middleware/fileUpload');

router.use(protect);
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

router.get('/search', resourceController.searchResources);
router.get('/:id', resourceController.getResourceDetail);
router.get('/:id/download', resourceController.downloadResource);

router.post(
  '/',
  authorize('lecturer'),
  fileUpload.uploadFile('resource'),
  resourceController.uploadResource
);

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

// Example implementation that would be needed
router.post('/external/save', resourceController.saveExternalResource);

module.exports = router;