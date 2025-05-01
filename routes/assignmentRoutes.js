// Create assignment routes
const express = require('express');
const router = express.Router();
const assignmentController = require('../controllers/assignmentController');
const { protect, authorize } = require('../middleware/authMiddleware');
const fileUpload = require('../middleware/fileUpload');

// Apply auth middleware
router.use(protect);

// Get single assignment - accessible to both lecturers and students
router.get('/:id', assignmentController.getAssignment);

// Routes for lecturers
router.put(
  '/:id', 
  authorize('lecturer', 'admin'),
  fileUpload.uploadMultiple('files', 3),
  assignmentController.updateAssignment
);

router.delete(
  '/:id', 
  authorize('lecturer', 'admin'),
  assignmentController.deleteAssignment
);

// Grade submissions (lecturer only)
router.post(
  '/:id/submissions/:submissionId/grade',
  authorize('lecturer', 'admin'),
  assignmentController.gradeSubmission
);

// Get submissions for an assignment (lecturer only)
router.get(
  '/:id/submissions',
  authorize('lecturer', 'admin'),
  assignmentController.getSubmissions
);

// Student submission routes
router.post(
  '/:id/submit',
  authorize('student'),
  fileUpload.uploadMultiple('files', 5),
  assignmentController.submitAssignment
);

router.put(
  '/:id/submit',
  authorize('student'),
  fileUpload.uploadMultiple('files', 5),
  assignmentController.updateSubmission
);

module.exports = router;