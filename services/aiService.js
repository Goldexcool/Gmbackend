const express = require('express');
const router = express.Router();

const { askQuestion: askQuestionController } = require('../controllers/aiController');

// Export methods to be used by routes
exports.askQuestion = async (req, res) => {
  return askQuestionController(req, res);
};

// Route for asking a question to the AI
router.post('/ask', exports.askQuestion);

module.exports = router;