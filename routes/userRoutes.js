const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');

// Apply middleware to all routes
router.use(protect);

// Routes accessible by students
router.get('/departments', userController.getDepartments);
router.get('/departments/:departmentName', userController.getDepartmentDetails);
router.get('/faqs', userController.getAllFAQs);

module.exports = router;