const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const assignmentController = require('../controllers/assignmentController');
const courseResourceController = require('../controllers/courseResourceController');
const examTimetableController = require('../controllers/examTimetableController');
const taskController = require('../controllers/taskController');
const courseRepController = require('../controllers/courseRepController');
const studentCourseRepController = require('../controllers/studentCourseRepController');
const { protect, authorize } = require('../middleware/authMiddleware');
const fileUpload = require('../middleware/fileUpload');

// Apply auth middleware to all routes
router.use(protect);
router.use(authorize('student'));

// Profile routes
router.put('/profile', fileUpload.single('profilePicture'), studentController.updateStudentProfile);

// Course routes
router.get('/courses', studentController.getStudentCourses);  
router.get('/courses/department', studentController.getCoursesByDepartmentAndLevel);
router.get('/courses/department-fallback', studentController.getCoursesByDepartmentAndLevelWithFallback);
router.get('/courses/available', studentController.getAvailableCourses);
router.get('/courses/:id', studentController.getCourseDetails);
router.post('/courses/:courseId/enroll', studentController.enrollInCourse);
router.delete('/courses/:courseId/enroll', studentController.dropCourse);

// Assignment routes
router.get('/assignments', assignmentController.getStudentAssignments);
router.get('/assignments/:id', assignmentController.getStudentAssignment);
router.post('/assignments/:id/submit', 
  fileUpload.uploadMultiple('files', 5), 
  assignmentController.submitAssignment);
router.put('/assignments/:id/submit', 
  fileUpload.uploadMultiple('files', 5), 
  assignmentController.updateSubmission);

// Task routes
router.get('/tasks', studentController.getStudentTasks);
router.get('/tasks/:id', studentController.getTaskDetails);
router.post('/tasks/:id/comments', fileUpload.uploadMultiple('attachments', 2), studentController.addTaskComment);

// Resource routes
router.get('/resources', courseResourceController.getStudentResources);
router.get('/resources/:id', courseResourceController.getStudentResource);
router.get('/resources/:id/download', courseResourceController.downloadResource);

// Check if student is a course rep
router.get('/is-course-rep', studentCourseRepController.getRepStatus);

// Course rep routes
router.get('/course-rep/status', studentCourseRepController.getRepStatus);
router.get('/course-rep/:repId/chat', studentCourseRepController.getChatMessages);
router.post(
  '/course-rep/:repId/chat',
  fileUpload.uploadMultiple('attachments', 5),
  studentCourseRepController.sendMessage
);

// Timetable route
router.get('/timetables', examTimetableController.getStudentTimetable);

module.exports = router;