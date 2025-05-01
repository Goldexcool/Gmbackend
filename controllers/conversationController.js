const Conversation = require('../models/Conversation');
const { textModel, complexModel } = require('../utils/aiModels');

// @desc    Create a new conversation
// @route   POST /api/conversations
// @access  Private
exports.createConversation = async (req, res) => {
  try {
    // Check if req.user exists
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const { title, initialMessage, useComplexModel } = req.body;
    
    if (!initialMessage) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an initial message for the conversation'
      });
    }
    
    // Select model based on request
    const model = useComplexModel ? complexModel : textModel;
    const modelName = useComplexModel ? 'gemini-1.5-pro' : 'gemini-1.5-flash';

    // Create new conversation
    const conversation = new Conversation({
      title: title || 'New Conversation',
      user: req.user.id,
      messages: [],  // Ensure this is always initialized as an array
      model: modelName
    });

    // Ensure messages exists before pushing
    if (!conversation.messages) {
      conversation.messages = [];
    }
    conversation.messages.push({ role: 'user', content: initialMessage });
    
    try {
      // Get AI response
      const result = await model.generateContent(initialMessage);
      const response = await result.response;
      const aiReply = response.text();
      
      // Add AI response to conversation
      conversation.messages.push({ 
        role: 'assistant', 
        content: aiReply
      });
    } catch (error) {
      console.error('AI error:', error);
      // Still create conversation with error message
      conversation.messages.push({ 
        role: 'assistant', 
        content: 'Sorry, I encountered an error processing your request. Please try again.'
      });
    }
    
    // Save conversation
    await conversation.save();
    
    res.status(201).json({
      success: true,
      data: conversation
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get user conversations
// @route   GET /api/conversations
// @access  Private
exports.getUserConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({ 
      user: req.user.id,
      isActive: true 
    })
    .select('title lastUpdated model createdAt')
    .sort('-lastUpdated');
    
    res.status(200).json({
      success: true,
      count: conversations.length,
      data: conversations
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get single conversation
// @route   GET /api/conversations/:id
// @access  Private
exports.getConversation = async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      user: req.user.id,
      isActive: true
    });
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: conversation
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Update conversation title
// @route   PUT /api/conversations/:id
// @access  Private
exports.updateConversationTitle = async (req, res) => {
  try {
    const { title } = req.body;
    
    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a title'
      });
    }
    
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      user: req.user.id,
      isActive: true
    });
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }
    
    conversation.title = title;
    await conversation.save();
    
    res.status(200).json({
      success: true,
      data: conversation
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Continue conversation (add new message)
// @route   POST /api/conversations/:id/messages
// @access  Private
exports.continueConversation = async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a message'
      });
    }
    
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      user: req.user.id,
      isActive: true
    });
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }
    
    // Add a debug check for messages
    if (!conversation.messages) {
      console.error('Messages array is undefined for conversation:', conversation._id);
      conversation.messages = []; // Initialize if missing
    }
    
    // Now push is safe
    conversation.messages.push({
      role: 'user',
      content: message
    });
    
    // Get AI model based on conversation settings
    const model = conversation.model.includes('pro') ? complexModel : textModel;
    
    try {
      // Generate AI response
      const result = await model.generateContent(message);
      const response = await result.response;
      const aiReply = response.text();
      
      // Add AI response
      conversation.messages.push({
        role: 'assistant',
        content: aiReply
      });
    } catch (error) {
      console.error('AI error:', error);
      
      // Add error message
      conversation.messages.push({
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.'
      });
    }
    
    // Update timestamp
    conversation.lastUpdated = Date.now();
    await conversation.save();
    
    res.status(200).json({
      success: true,
      data: conversation
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Delete conversation (soft delete)
// @route   DELETE /api/conversations/:id
// @access  Private
exports.deleteConversation = async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      user: req.user.id
    });
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }
    
    // Soft delete by marking as inactive
    conversation.isActive = false;
    await conversation.save();
    
    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};