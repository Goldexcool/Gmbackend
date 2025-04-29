const express = require('express');
const router = express.Router();
const conversationController = require('../controllers/conversationController');
const { protect } = require('../middleware/authMiddleware');

// Apply authentication middleware
router.use(protect);

// Debug check
console.log('Controller functions:', Object.keys(conversationController));

// CRUD operations
router.get('/', conversationController.getUserConversations);
router.post('/', conversationController.createConversation);
router.get('/:id', conversationController.getConversation);
router.delete('/:id', conversationController.deleteConversation);

// Title update routes - support both patterns
router.put('/:id/title', (req, res) => {
  if (conversationController.updateConversationTitle) {
    conversationController.updateConversationTitle(req, res);
  } else {
    res.status(501).json({
      success: false,
      message: 'Title update functionality is not implemented yet'
    });
  }
});

// Add support for /rename endpoint too
router.put('/:id/rename', (req, res) => {
  if (conversationController.updateConversationTitle) {
    conversationController.updateConversationTitle(req, res);
  } else {
    res.status(501).json({
      success: false,
      message: 'Title update functionality is not implemented yet'
    });
  }
});

// Add this route for direct PUT requests to the base conversation URL
router.put('/:id', (req, res) => {
  if (conversationController.updateConversationTitle) {
    // Assume we're updating title if that's what's in the request
    if (req.body.title) {
      conversationController.updateConversationTitle(req, res);
    } else {
      res.status(400).json({
        success: false,
        message: 'Please provide a title or other data to update'
      });
    }
  } else {
    res.status(501).json({
      success: false,
      message: 'Update functionality is not implemented yet'
    });
  }
});

// Continue conversation
router.post('/:id/messages', conversationController.continueConversation);

module.exports = router;