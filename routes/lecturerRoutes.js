const express = require('express');
const { 
    setSchedule,
    createTask,
    updateTask,
    getStudents,
    assignCourseRep,
    getLecturerProfile
} = require('../controllers/lecturerController');
const { protect, authorize } = require('../middleware/authMiddleware');
const ROLES = { LECTURER: 'lecturer', STUDENT: 'student', ADMIN: 'admin' };
const lecturerController = require('../controllers/lecturerController');

const router = express.Router();

// Apply middleware to all routes
router.use(protect);
router.use(authorize(ROLES.LECTURER));

// IMPORTANT: Place specific routes BEFORE parameter routes
// FAQ routes - move these up
router.get('/faqs', lecturerController.getAllFAQs);

// Department routes - move these up
router.get('/departments', lecturerController.getDepartments);
router.get('/departments/:departmentName', lecturerController.getDepartmentDetails);

// Set class time/venue
router.post('/:id/schedule', setSchedule); 

// Add personal task
router.post('/:id/tasks', createTask);

// Update task
router.put('/:id/tasks/:taskId', updateTask);

// View students
router.get('/:id/students', getStudents);

// Assign course rep
router.post('/:id/course-rep', assignCourseRep);

// Get lecturer profile - most generic path should be last
router.get('/:id', getLecturerProfile);

module.exports = router;