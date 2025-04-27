const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const { protect, authorize } = require('../middleware/auth');

// Protected routes that require authentication
router.use(protect);

// Course management - accessible to lecturers and admins
router.post('/', authorize('lecturer', 'admin'), courseController.createCourse);
router.put('/:id', authorize('lecturer', 'admin'), courseController.updateCourse);
router.delete('/:id', authorize('admin'), courseController.deleteCourse);
router.post('/:id/materials', authorize('lecturer', 'admin'), courseController.addCourseMaterial);

// Student enrollment
router.post('/enroll/:id', authorize('student'), courseController.enrollCourse);
router.delete('/unenroll/:id', authorize('student'), courseController.unenrollCourse);

// Course students - accessible to course lecturers and admins
router.get('/:id/students', authorize('lecturer', 'admin'), courseController.getCourseStudents);

// Get enrolled/teaching courses
router.get('/enrolled', authorize('student'), courseController.getEnrolledCourses);
router.get('/teaching', authorize('lecturer'), courseController.getTeachingCourses);

// General course listing and details - accessible to all authenticated users
router.get('/', courseController.getAllCourses);
router.get('/:id', courseController.getCourse);

module.exports = router;