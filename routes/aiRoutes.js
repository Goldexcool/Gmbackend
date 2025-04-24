const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
// Fix the import path to match your actual file structure
const { protect: authenticate, authorize } = require('../middleware/authMiddleware');

// Make sure all controller methods exist and are properly exported
const { generateText, generateQuiz } = aiController;

// Check if methods exist before registering routes
if (!generateText) {
  console.error('Warning: aiController.generateText is undefined');
}

if (!generateQuiz) {
  console.error('Warning: aiController.generateQuiz is undefined');
}

// AI routes
router.post('/generate-text', authenticate, aiController.generateText);
router.post('/generate-quiz', authenticate, aiController.generateQuiz);

module.exports = router;