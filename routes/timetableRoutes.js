const express = require('express');
const router = express.Router();
const examTimetableController = require('../controllers/examTimetableController');
const { protect } = require('../middleware/authMiddleware');

// Apply auth middleware
router.use(protect);

// Public timetable routes (for all authenticated users)
router.get('/', examTimetableController.getPublishedTimetables);
router.get('/:id', examTimetableController.getPublishedTimetable);

module.exports = router;