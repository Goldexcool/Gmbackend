const express = require('express');
const { askQuestion } = require('../controllers/aiController');

const router = express.Router();

// Route for asking a question to the AI
router.post('/ask', askQuestion);

module.exports = router;