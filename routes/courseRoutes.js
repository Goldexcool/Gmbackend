const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const { protect, authorize } = require('../middleware/authMiddleware');
const fileUpload = require('../middleware/fileUpload');

// Public routes (no authentication needed)
router.get('/public', courseController.getPublicCourses);

// Protected routes (authentication needed)
router.use(protect);

// Routes accessible to all authenticated users
router.get('/', courseController.getAllCourses);
router.get('/:id', courseController.getCourseById);
router.get('/:id/resources', courseController.getCourseResources);

// Admin only routes
router.use(authorize('admin'));
router.post('/', courseController.createCourse);
router.put('/:id', courseController.updateCourse);
router.delete('/:id', courseController.deleteCourse);

// Bulk operations for admin
router.post('/bulk-create', courseController.bulkCreateCourses);
router.post('/bulk-update', courseController.bulkUpdateCourses);
router.post('/bulk-delete', courseController.bulkDeleteCourses);

// Enrollment management
router.post('/:id/enroll', courseController.enrollStudents);
router.delete('/:id/enroll', courseController.removeStudentsFromCourse);

// Lecturer assignment
router.post('/:id/assign-lecturer', courseController.assignLecturer);
router.delete('/:id/lecturer', courseController.removeLecturer);

// Department management
router.get('/by-department/:departmentId', courseController.getCoursesByDepartment);
router.get('/by-faculty/:facultyId', courseController.getCoursesByFaculty);

// Academic session management
router.get('/by-session/:sessionId', courseController.getCoursesBySession);

// Add the statistics route with the implemented controller method
router.get('/statistics', courseController.getCourseStatistics);

module.exports = router;