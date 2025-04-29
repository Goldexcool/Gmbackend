const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { protect: authenticate, authorize } = require('../middleware/authMiddleware');

// Apply authentication middleware
router.use(authenticate);

// Make sure all controller methods exist and are properly exported
const { generateText, generateQuiz, summarizeDocument, generateResponse, analyzeVisual } = aiController;

// Check if methods exist before registering routes
if (!generateText) {
  console.error('Warning: aiController.generateText is undefined');
}

if (!generateQuiz) {
  console.error('Warning: aiController.generateQuiz is undefined');
}

if (!summarizeDocument) {
  console.error('Warning: aiController.summarizeDocument is undefined');
}

if (!generateResponse) {
  console.error('Warning: aiController.generateResponse is undefined');
}

if (!analyzeVisual) {
  console.error('Warning: aiController.analyzeVisual is undefined');
}

// AI routes
router.post('/generate-text', aiController.generateText);
router.post('/generate-quiz', aiController.generateQuiz);
router.post('/summarize', aiController.summarizeDocument);
router.post('/generate', aiController.generateResponse);
router.post('/analyze-visual', aiController.analyzeVisual);
router.get('/models', aiController.listAvailableModels);
router.get('/info', aiController.getApiInfo);
router.get('/status', aiController.getModelStatus);

// Add this missing route
router.post('/summarize-text', aiController.summarizeText);

// Add these new routes for conversation features
router.post('/conversation/start', aiController.startConversation);
router.post('/chat', aiController.quickChat);

module.exports = router;