const express = require('express');
const router = express.Router();
const academicSessionController = require('../controllers/academicSessionController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Public routes (still require authentication)
router.get('/', protect, academicSessionController.getAllAcademicSessions);
router.get('/current', protect, academicSessionController.getCurrentSession);

// Admin-only routes
router.post('/', protect, authorize('admin'), academicSessionController.createAcademicSession);
router.put('/:id', protect, authorize('admin'), academicSessionController.updateAcademicSession);
router.delete('/:id', protect, authorize('admin'), academicSessionController.deleteAcademicSession);
router.put('/:id/activate', protect, authorize('admin'), academicSessionController.setActiveSession);
router.put('/:id/archive', protect, authorize('admin'), academicSessionController.archiveAcademicSession);

module.exports = router;