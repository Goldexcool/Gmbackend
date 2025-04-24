const express = require('express');
const { 
  getChats,
  createChat, 
  getChatById, 
  updateChat, 
  addUserToChat, 
  removeUserFromChat,
  deleteChat,
  sendMessage,
  getMessages
} = require('../controllers/chatController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

const router = express.Router();

// Apply auth middleware to all routes
router.use(protect);

// Get all chats for a user
router.get('/', getChats);

// Create a new chat (group or one-to-one)
router.post('/', createChat);

// Get a specific chat by ID
router.get('/:chatId', getChatById);

// Update chat (name, description, etc.)
router.put('/:chatId', updateChat);

// Add a user to a chat
router.post('/:chatId/users', addUserToChat);

// Remove a user from a chat
router.delete('/:chatId/users/:userId', removeUserFromChat);

// Delete a chat
router.delete('/:chatId', deleteChat);

// Send a message to a chat
router.post('/:chatId/messages', upload.array('attachments', 5), sendMessage);

// Get all messages for a chat
router.get('/:chatId/messages', getMessages);

module.exports = router;