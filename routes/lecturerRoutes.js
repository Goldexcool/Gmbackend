const express = require('express');
const router = express.Router();
const lecturerController = require('../controllers/lecturerController');
const resourceController = require('../controllers/resourceController');
const assignmentController = require('../controllers/assignmentController');
const courseRepController = require('../controllers/courseRepController');
const { protect, authorize } = require('../middleware/authMiddleware');
const fileUpload = require('../middleware/fileUpload');

// Apply auth middleware to all routes
router.use(protect);
router.use(authorize('lecturer'));

// Profile routes
router.put('/profile', fileUpload.uploadSingle('profilePicture'), lecturerController.updateLecturerProfile);

// Course resources routes
router.get('/resources', resourceController.getLecturerResources);
router.get('/resources/:id', resourceController.getLecturerResource);
router.post(
  '/resources', 
  fileUpload.uploadMultiple('files', 5), 
  resourceController.createResource
);
router.put(
  '/resources/:id', 
  fileUpload.uploadMultiple('files', 5), 
  resourceController.updateResource
);
router.delete('/resources/:id', resourceController.deleteResource);

// Assignment routes
router.get('/assignments', assignmentController.getLecturerAssignments);
router.get('/assignments/:id', lecturerController.getLecturerAssignment);

// Course representative routes
router.get('/course-reps', courseRepController.getCourseReps);
router.post('/courses/:courseId/course-rep', courseRepController.assignCourseRep);
router.delete('/course-reps/:repId', courseRepController.removeCourseRep);
router.get('/course-reps/:repId/chat', courseRepController.getChatMessages);
router.post(
  '/course-reps/:repId/chat',
  fileUpload.uploadMultiple('attachments', 5),
  courseRepController.sendMessage
);

// Student routes
router.get('/courses/:courseId/students', courseRepController.getEnrolledStudents);
router.get('/students', courseRepController.getStudentsByDepartmentAndLevel);

// FAQ routes
router.get('/faqs', lecturerController.getAllFAQs);

// Department routes
router.get('/departments', lecturerController.getDepartments);
router.get('/departments/:departmentName', lecturerController.getDepartmentDetails);

// Schedule and task routes
router.post('/schedule', lecturerController.setSchedule);
router.post('/tasks', lecturerController.createTask);
router.put('/tasks/:taskId', lecturerController.updateTask);

// Chat routes
router.post('/chat', lecturerController.chatWithStudent);

module.exports = router;