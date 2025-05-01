const express = require('express');
const router = express.Router();
const resourceLibraryController = require('../controllers/resourceLibraryController');
const { protect, authorize } = require('../middleware/authMiddleware');
const fileUpload = require('../middleware/fileUpload');

// Apply auth middleware to all routes
router.use(protect);
// Only allow students and lecturers to access resources
router.use(authorize('student', 'lecturer'));

// Routes for students and lecturers
router.get('/search', resourceLibraryController.searchResources);
router.get('/featured', resourceLibraryController.getFeaturedResources);
router.get('/:id', resourceLibraryController.getResourceDetails);
router.get('/:id/download', resourceLibraryController.downloadResource);
router.post('/:id/rate', resourceLibraryController.rateResource);
router.post('/:id/share', resourceLibraryController.shareResource);

// Import external resource (lecturer only)
router.post(
  '/import', 
  authorize('lecturer'),
  resourceLibraryController.importExternalResource
);

// Upload resource (lecturer only)
router.post(
  '/',
  authorize('lecturer'),
  fileUpload.uploadFile('resource', 50), // 50MB limit
  resourceLibraryController.uploadResource
);

// Students can upload but need approval
router.post(
  '/student-upload',
  authorize('student'),
  fileUpload.uploadFile('resource', 20), // 20MB limit for students
  resourceLibraryController.studentUploadResource
);

// Resource management (lecturer only)
router.route('/:id')
  .put(authorize('lecturer'), resourceLibraryController.updateResource)
  .delete(authorize('lecturer'), resourceLibraryController.deleteResource);

module.exports = router;