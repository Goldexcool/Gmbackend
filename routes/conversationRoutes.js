const express = require('express');
const router = express.Router();
const conversationController = require('../controllers/conversationController');
const { protect } = require('../middleware/authMiddleware');

// Apply authentication middleware
router.use(protect);

// Debug check
console.log('Controller functions:', Object.keys(conversationController));

// Log requests for debugging
router.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  console.log('Request body:', req.body);
  next();
});

// CRUD operations
router.get('/', conversationController.getUserConversations);
router.post('/', (req, res, next) => {
  // Check for initialMessage and provide clear error if missing
  if (!req.body.initialMessage) {
    return res.status(400).json({
      success: false,
      message: 'Please provide an initial message for the conversation',
      example: {
        initialMessage: "Your conversation starter message here",
        title: "Optional title for the conversation"
      }
    });
  }
  conversationController.createConversation(req, res, next);
});

router.get('/:id', conversationController.getConversation);

// Main conversation update endpoint
router.put('/:id', (req, res) => {
  console.log('PUT to /:id with body:', req.body);
  
  if (req.body.title && conversationController.updateConversationTitle) {
    conversationController.updateConversationTitle(req, res);
  } else {
    res.status(400).json({
      success: false,
      message: 'Please provide a title to update',
      example: { title: "New conversation title" }
    });
  }
});

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

router.delete('/:id', conversationController.deleteConversation);

// Continue conversation
router.post('/:id/messages', conversationController.continueConversation);

module.exports = router;