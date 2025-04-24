const express = require('express');
const { 
    createStudyGroup,
    joinStudyGroup,
    leaveStudyGroup,
    getStudyGroup,
    getAllStudyGroups,
    updateStudyGroup,
    sendGroupMessage
} = require('../Controllers/StudyGroupController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Apply middleware to all routes
router.use(protect);

// Create study group
router.post('/', createStudyGroup);

// Join study group
router.post('/:id/join', joinStudyGroup);

// Leave study group
router.post('/:id/leave', leaveStudyGroup);

// Get study group details
router.get('/:id', getStudyGroup);

// Get all public study groups
router.get('/', getAllStudyGroups);

// Update study group
router.put('/:id', updateStudyGroup);

// Send message to study group
router.post('/:id/message', sendGroupMessage);

module.exports = router;