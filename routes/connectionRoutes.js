const express = require('express');
const router = express.Router();
const connectionController = require('../controllers/connectionController');
const { protect, authorize } = require('../middleware/authMiddleware');
const fileUpload = require('../middleware/fileUpload');

// Apply auth middleware to all routes
router.use(protect);

router.post('/request/:userId', connectionController.sendConnectionRequest);
router.get('/suggestions', connectionController.getConnectionSuggestions);
router.get('/requests', connectionController.getConnectionRequests);
router.get('/my-connections', connectionController.getMyConnections);
router.put('/accept/:connectionId', connectionController.acceptConnectionRequest);
router.put('/reject/:connectionId', connectionController.rejectConnectionRequest);
router.delete('/:connectionId', connectionController.removeConnection);

// Chat functionality
router.get('/conversations', connectionController.getMyConversations);
router.get('/conversations/:conversationId/messages', connectionController.getConversationMessages);
router.post('/conversations/:conversationId/messages', 
  fileUpload.uploadMultiple('attachments', 3),
  connectionController.sendMessage);
router.put('/messages/:messageId/read', connectionController.markMessageAsRead);

// Student search and profile
router.get('/search', connectionController.searchStudents);
router.get('/student/:studentId', connectionController.getStudentProfile);
router.get('/departments', connectionController.getDepartmentsForSearch);

module.exports = router;