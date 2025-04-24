const express = require('express');
const { 
    getDashboard, 
    getSchedule, 
    createTask, 
    updateTask, 
    getStudentProfile 
} = require('../controllers/studentController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { ROLES } = require('../config/constants');

const router = express.Router();

// Apply middleware to all routes
router.use(protect);
router.use(authorize(ROLES.STUDENT));

// Get student dashboard
router.get('/:id/dashboard', getDashboard);

// Get student schedule
router.get('/:id/schedule', getSchedule);

// Create task
router.post('/:id/tasks', createTask);

// Update task (complete/reopen)
router.put('/:id/tasks/:taskId', updateTask);

// Get student profile
router.get('/:id', getStudentProfile);

module.exports = router;