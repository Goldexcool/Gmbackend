const express = require('express');
const { 
    assignCourse,
    sendNotification,
    getAllUsers,
    setGlobalSchedule,
    getAdminDashboard
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { ROLES } = require('../config/constants');

const router = express.Router();

// Apply middleware to all routes
router.use(protect);
router.use(authorize(ROLES.ADMIN));

// Assign course to lecturer
router.post('/assign-course', assignCourse);

// Send global announcements
router.post('/notify', sendNotification);

// View all users
router.get('/users', getAllUsers);

// Set global schedule entries
router.post('/schedule', setGlobalSchedule);

// Get admin dashboard
router.get('/dashboard', getAdminDashboard);

module.exports = router;