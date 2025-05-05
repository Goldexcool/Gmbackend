const { GoogleGenerativeAI } = require('@google/generative-ai');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { textModel, complexModel } = require('../utils/aiModels');

// Correct API version from test results
const API_VERSION = "v1beta"; // This is what's working with your models

let pdfParse;
let mammoth;
try {
  pdfParse = require('pdf-parse');
} catch (err) {
  console.warn('pdf-parse module not found. PDF processing will not be available.');
}

try {
  mammoth = require('mammoth');
} catch (err) {
  console.warn('mammoth module not found. DOCX processing will not be available.');
}

// Ensure uploads directory exists
const uploadsDir = './uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// File upload configuration
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: function(req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});

// Initialize upload with proper configuration for documents
const upload = multer({
  storage: storage,
  limits: { fileSize: 10000000 }, // 10MB limit
  fileFilter: function(req, file, cb) {
    // Allowed extensions
    const filetypes = /pdf|doc|docx|txt/;
    // Check extension
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    // Check mime
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb('Error: Only PDF, DOC, DOCX, and TXT files are allowed!');
    }
  }
}).single('file');

// Extract text from PDF
async function extractTextFromPDF(filePath) {
  if (!pdfParse) {
    throw new Error('PDF processing is not available. Please install pdf-parse package.');
  }
  
  const dataBuffer = fs.readFileSync(filePath);
  try {
    const data = await pdfParse(dataBuffer);
    return data.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error('Failed to extract text from PDF');
  }
}

// Extract text from DOCX
async function extractTextFromDOCX(filePath) {
  if (!mammoth) {
    throw new Error('DOCX processing is not available. Please install mammoth package.');
  }
  
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } catch (error) {
    console.error('Error extracting text from DOCX:', error);
    throw new Error('Failed to extract text from DOCX');
  }
}

// @desc    Generate text based on prompt
// @route   POST /api/ai/generate-text
// @access  Private
exports.generateText = async (req, res) => {
  try {
    const { prompt, maxTokens = 800 } = req.body;
    
    if (!prompt) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a prompt'
      });
    }
    
    // Use the faster model for simple text generation
    const result = await textModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    res.status(200).json({
      success: true,
      model: "gemini-1.5-flash",
      data: {
        generated_text: text
      }
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

// @desc    Generate quiz based on content (complex task - use pro model)
// @route   POST /api/ai/generate-quiz
// @access  Private
exports.generateQuiz = async (req, res) => {
  try {
    const { content, numQuestions = 5, difficulty = 'medium' } = req.body;
    
    if (!content) {
      return res.status(400).json({
        success: false,
        message: 'Please provide content for quiz generation'
      });
    }
    
    // Create prompt for quiz generation
    const quizPrompt = `
      Create a ${difficulty} difficulty quiz with ${numQuestions} questions based on this content:
      
      ${content}
      
      Format the output as a JSON array with each question having:
      1. question_text
      2. options (array of 4 choices)
      3. correct_answer (index of correct option)
      4. explanation
    `;
    
    // Use the more capable model for structured output
    const result = await complexModel.generateContent(quizPrompt);
    const response = await result.response;
    const generatedText = response.text();
    
    // Extract JSON from response
    const jsonMatch = generatedText.match(/```json\n([\s\S]*?)\n```/) || 
                     generatedText.match(/\[\n\s*\{[\s\S]*\}\n\]/);
    
    let quiz;
    if (jsonMatch && jsonMatch[1]) {
      try {
        quiz = JSON.parse(jsonMatch[1]);
      } catch (e) {
        console.error('Failed to parse quiz JSON', e);
        quiz = { raw: generatedText };
      }
    } else {
      quiz = { raw: generatedText };
    }
    
    res.status(200).json({
      success: true,
      model: "gemini-1.5-pro",
      data: {
        quiz
      }
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

// @desc    Summarize document content
// @route   POST /api/ai/summarize
// @access  Private
exports.summarizeDocument = async (req, res) => {
  try {
    upload(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err
        });
      }
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }

      // Get file path
      const filePath = req.file.path;
      const fileExt = path.extname(req.file.originalname).toLowerCase();
      
      let text = '';
      
      // Extract text based on file type
      try {
        if (fileExt === '.pdf') {
          if (!pdfParse) {
            fs.unlinkSync(filePath);
            return res.status(400).json({
              success: false,
              message: 'PDF processing is not available. Please install pdf-parse package.'
            });
          }
          text = await extractTextFromPDF(filePath);
        } else if (fileExt === '.docx') {
          if (!mammoth) {
            fs.unlinkSync(filePath);
            return res.status(400).json({
              success: false,
              message: 'DOCX processing is not available. Please install mammoth package.'
            });
          }
          text = await extractTextFromDOCX(filePath);
        } else if (fileExt === '.txt') {
          text = fs.readFileSync(filePath, 'utf8');
        } else {
          fs.unlinkSync(filePath);
          return res.status(400).json({
            success: false,
            message: 'Unsupported file format'
          });
        }
      } catch (error) {
        // Make sure to clean up the file if there's an error
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.error('Failed to delete file after error:', e);
        }
        
        return res.status(500).json({
          success: false,
          message: 'Error processing file',
          error: error.message
        });
      }
      
      if (!text || text.length < 100) {
        // Clean up the file
        fs.unlinkSync(filePath);
        
        return res.status(400).json({
          success: false,
          message: 'Not enough text content to summarize. The file may be empty or contain non-text content.'
        });
      }
      
      // Get max length from request or use default
      const maxLength = req.body.maxLength || 300;
      
      try {
        // Generate summary with the text model (faster)
        const summaryPrompt = `
          Create a concise summary in approximately ${maxLength} words of this text:
          
          ${text.slice(0, 15000)} // Limit to 15000 characters to avoid token limits
        `;
        
        const result = await textModel.generateContent(summaryPrompt);
        const response = await result.response;
        const summary = response.text();
        
        // Delete the file after processing
        fs.unlinkSync(filePath);
        
        res.status(200).json({
          success: true,
          model: "gemini-1.5-flash",
          data: {
            summary,
            originalCharCount: text.length,
            summaryCharCount: summary.length
          }
        });
      } catch (error) {
        // Clean up the file if there's an error
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.error('Failed to delete file after AI error:', e);
        }
        
        console.error('AI processing error:', error);
        res.status(500).json({
          success: false,
          message: 'Error generating summary',
          error: error.message
        });
      }
    });
  } catch (error) {
    console.error('Outer error in summarizeDocument:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Summarize text content directly (no file processing)
// @route   POST /api/ai/summarize-text
// @access  Private
exports.summarizeText = async (req, res) => {
  try {
    const { text, maxLength = 300 } = req.body;
    
    if (!text || text.length < 100) {
      return res.status(400).json({
        success: false,
        message: 'Please provide text content with at least 100 characters'
      });
    }
    
    // Generate summary with the text model (faster)
    const summaryPrompt = `
      Create a concise summary in approximately ${maxLength} words of this text:
      
      ${text.slice(0, 15000)}
    `;
    
    const result = await textModel.generateContent(summaryPrompt);
    const response = await result.response;
    const summary = response.text();
    
    res.status(200).json({
      success: true,
      model: "gemini-1.5-flash",
      data: {
        summary,
        originalCharCount: text.length,
        summaryCharCount: summary.length
      }
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

// @desc    Generate AI response based on text input
// @route   POST /api/ai/generate
// @access  Private
exports.generateResponse = async (req, res) => {
  try {
    const { prompt, temperature = 0.7 } = req.body;
    
    if (!prompt) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a prompt'
      });
    }
    
    // Configure generation parameters
    const generationConfig = {
      temperature: parseFloat(temperature),
      topK: 40,
      topP: 0.95,
    };
    
    // Generate response with Gemini
    const genModel = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash", // Updated from gemini-pro
      generationConfig,
    });
    
    const result = await genModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    res.status(200).json({
      success: true,
      data: {
        response: text
      }
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

// @desc    Analyze image or PDF visually
// @route   POST /api/ai/analyze-visual
// @access  Private
exports.analyzeVisual = async (req, res) => {
  try {
    // Configure upload for image files
    const imageUpload = multer({
      storage: storage,
      limits: { fileSize: 5000000 }, // 5MB limit
      fileFilter: function(req, file, cb) {
        // Check allowed image types
        const filetypes = /jpeg|jpg|png|gif/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        
        if (mimetype && extname) {
          return cb(null, true);
        } else {
          cb('Error: Only JPG, JPEG, PNG, and GIF images are allowed');
        }
      }
    }).single('image');
    
    imageUpload(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err
        });
      }
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No image uploaded'
        });
      }
      
      // Get file path
      const filePath = req.file.path;
      const fileExt = path.extname(req.file.originalname).toLowerCase();
      const prompt = req.body.prompt || 'Analyze this image in detail and describe what you see.';
      
      // Since our tests showed vision-specific models aren't available,
      // we'll use a different approach by converting images to base64 and using complexModel
      try {
        // Read the image file
        const imageBuffer = fs.readFileSync(filePath);
        const base64Image = imageBuffer.toString('base64');
        
        // Since vision models aren't available, we'll use a workaround:
        // We'll use text analysis on the image description
        const textAnalysis = `
          The image you uploaded has been processed. 
          
          While direct image analysis isn't available with the current API configuration,
          you can use OCR services or image description tools to extract text from images.
          
          For educational content, consider using text-based prompts or uploading text content
          directly for better results.
          
          File information:
          - File type: ${fileExt}
          - File size: ${(imageBuffer.length / 1024).toFixed(2)} KB
        `;
        
        // Delete the file after processing
        fs.unlinkSync(filePath);
        
        res.status(200).json({
          success: true,
          data: {
            analysis: textAnalysis,
            imageSupport: "Limited - vision models not available",
            recommendation: "For best results, extract text from images first using OCR, then use our text analysis APIs"
          }
        });
      } catch (error) {
        // Clean up the file if there's an error
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.error('Failed to delete image after error:', e);
        }
        
        console.error('Image processing error:', error);
        res.status(500).json({
          success: false,
          message: 'Error analyzing image',
          error: error.message
        });
      }
    });
  } catch (error) {
    console.error('Outer error in analyzeVisual:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    List available Gemini models
// @route   GET /api/ai/models
// @access  Private
exports.listAvailableModels = async (req, res) => {
  try {
    // Current models as of April 2025
    const modelNames = [
      "gemini-1.5-flash",
      "gemini-1.5-flash-vision",
      "gemini-1.5-pro",
      "gemini-1.5-pro-vision",
      // Try these as fallbacks
      "gemini-pro",
      "gemini-pro-vision"
    ];
    
    const results = {};
    let workingModel = null;
    
    for (const modelName of modelNames) {
      try {
        console.log(`Testing model: ${modelName}`);
        const testModel = genAI.getGenerativeModel({ model: modelName });
        const result = await testModel.generateContent("Test");
        const response = await result.response;
        const text = response.text();
        
        results[modelName] = {
          status: "Available",
          sample: text.substring(0, 50) + (text.length > 50 ? "..." : "")
        };
        
        // Save the first working model
        if (!workingModel) {
          workingModel = modelName;
        }
      } catch (err) {
        results[modelName] = {
          status: "Error",
          message: err.message
        };
      }
    }
    
    res.status(200).json({
      success: true,
      recommendedModel: workingModel,
      data: {
        availableModels: results
      }
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

// @desc    Get API version and configuration info
// @route   GET /api/ai/info
// @access  Private
exports.getApiInfo = async (req, res) => {
  try {
    // Try a simple call to get version info from response headers
    let apiVersionInfo = "Unknown";
    let apiEndpoint = "Unknown";
    
    try {
      // Attempt to make a request and capture version info from any errors
      const testModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await testModel.generateContent("Hello");
      apiVersionInfo = "Call succeeded - likely using latest version";
      apiEndpoint = "Default endpoint";
    } catch (err) {
      // Extract API version info from error message if possible
      const versionMatch = err.message.match(/API version ([a-z0-9]+)/);
      if (versionMatch) {
        apiVersionInfo = versionMatch[1];
      }
      
      const urlMatch = err.message.match(/https:\/\/[^:]+/);
      if (urlMatch) {
        apiEndpoint = urlMatch[0];
      }
    }
    
    res.status(200).json({
      success: true,
      data: {
        library: "@google/generative-ai",
        apiKeyPresent: !!process.env.GEMINI_API_KEY,
        apiKeyFirstChars: process.env.GEMINI_API_KEY ? 
          `${process.env.GEMINI_API_KEY.substring(0, 3)}...` : "Not set",
        detectedApiVersion: apiVersionInfo,
        apiEndpoint: apiEndpoint,
        nodejs: process.version,
        environment: process.env.NODE_ENV || "development"
      }
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

// @desc    Get current model configuration and status
// @route   GET /api/ai/status
// @access  Private
exports.getModelStatus = async (req, res) => {
  try {
    // Test currently configured models
    let textModelStatus = "Unknown";
    let complexModelStatus = "Unknown";
    
    try {
      const result = await textModel.generateContent("Test");
      textModelStatus = "Available";
    } catch (err) {
      textModelStatus = `Error: ${err.message}`;
    }
    
    try {
      const result = await complexModel.generateContent("Test");
      complexModelStatus = "Available";
    } catch (err) {
      complexModelStatus = `Error: ${err.message}`;
    }
    
    res.status(200).json({
      success: true,
      data: {
        apiVersion: API_VERSION,
        models: {
          "textModel": {
            name: "gemini-1.5-flash",
            status: textModelStatus
          },
          "complexModel": {
            name: "gemini-1.5-pro", 
            status: complexModelStatus
          },
          "visionStatus": "Not available in current API configuration"
        },
        environment: process.env.NODE_ENV || "development"
      }
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

// @desc    Quick chat without saving conversation
// @route   POST /api/ai/chat
// @access  Private
exports.quickChat = async (req, res) => {
  try {
    const { message, useComplexModel, history = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a message'
      });
    }
    
    // Select model
    const model = useComplexModel ? complexModel : textModel;
    const modelName = useComplexModel ? 'gemini-1.5-pro' : 'gemini-1.5-flash';
    
    // Format history for Gemini API
    const chatHistory = history.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));
    
    // Start chat
    const chat = model.startChat({
      history: chatHistory,
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      }
    });
    
    // Get response
    const result = await chat.sendMessage(message);
    const response = await result.response;
    const aiReply = response.text();
    
    res.status(200).json({
      success: true,
      model: modelName,
      data: {
        message: aiReply,
        history: [
          ...history,
          { role: 'user', content: message },
          { role: 'assistant', content: aiReply }
        ]
      }
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

// @desc    Start a new conversation with name generation
// @route   POST /api/ai/conversations/start
// @access  Private
exports.startConversation = async (req, res) => {
  try {
    const { message, useComplexModel, conversationName } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an initial message'
      });
    }
    
    // Select model
    const model = useComplexModel ? complexModel : textModel;
    const modelName = useComplexModel ? 'gemini-1.5-pro' : 'gemini-1.5-flash';
    
    // Generate AI response
    const result = await model.generateContent(message);
    const response = await result.response;
    const aiReply = response.text();
    
    // Generate conversation name if not provided
    let suggestedName = conversationName;
    if (!suggestedName) {
      try {
        // Ask the AI to generate a conversation name based on the first message
        const namePrompt = `Based on this message, suggest a short, descriptive title (3-5 words) for this conversation: "${message}"`;
        const nameResult = await textModel.generateContent(namePrompt);
        const nameResponse = await nameResult.response;
        suggestedName = nameResponse.text().trim().replace(/^["']|["']$/g, ''); // Remove quotes if present
      } catch (err) {
        console.error('Error generating conversation name:', err);
        // Create a simple name based on the first few words
        suggestedName = message.split(' ').slice(0, 4).join(' ');
        if (message.length > suggestedName.length) suggestedName += '...';
      }
    }
    
    // Create and save the conversation to database
    const newConversation = new Conversation({
      user: req.user.id,
      title: suggestedName,
      model: modelName,
      messages: [
        { role: 'user', content: message, timestamp: new Date() },
        { role: 'assistant', content: aiReply, timestamp: new Date() }
      ],
      lastUpdated: new Date()
    });
    
    await newConversation.save();
    
    res.status(201).json({
      success: true,
      data: {
        conversation: {
          id: newConversation._id,
          title: newConversation.title,
          messages: newConversation.messages,
          createdAt: newConversation.createdAt,
          lastUpdated: newConversation.lastUpdated,
          model: newConversation.model
        }
      }
    });
  } catch (error) {
    console.error('Error starting conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get all conversations for the current user
// @route   GET /api/ai/conversations
// @access  Private
exports.getConversations = async (req, res) => {
  try {
    // Find all conversations for the current user
    const conversations = await Conversation.find({ user: req.user.id })
      .sort('-lastUpdated')
      .select('_id title lastUpdated model');
    
    res.status(200).json({
      success: true,
      count: conversations.length,
      data: conversations.map(conv => ({
        id: conv._id,
        title: conv.title,
        lastUpdated: conv.lastUpdated,
        model: conv.model || 'gemini-1.5-flash'
      }))
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get a full conversation by ID
// @route   GET /api/ai/conversations/:conversationId
// @access  Private
exports.getConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    // Find the conversation by ID and user
    const conversation = await Conversation.findOne({
      _id: conversationId,
      user: req.user.id
    });
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found or you do not have permission to access it'
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        id: conversation._id,
        title: conversation.title,
        messages: conversation.messages,
        createdAt: conversation.createdAt,
        lastUpdated: conversation.lastUpdated,
        model: conversation.model || 'gemini-1.5-flash'
      }
    });
  } catch (error) {
    console.error('Error getting conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Continue an existing conversation
// @route   POST /api/ai/conversations/:conversationId/continue
// @access  Private
exports.continueConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { message, useComplexModel } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a message'
      });
    }
    
    // Find the conversation by ID and user
    const conversation = await Conversation.findOne({
      _id: conversationId,
      user: req.user.id
    });
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found or you do not have permission to access it'
      });
    }
    
    // Determine which model to use - either from the request, or use the one from the conversation
    const modelToUse = useComplexModel !== undefined ? 
      (useComplexModel ? complexModel : textModel) : 
      (conversation.model === 'gemini-1.5-pro' ? complexModel : textModel);
    
    const modelName = modelToUse === complexModel ? 'gemini-1.5-pro' : 'gemini-1.5-flash';
    
    // Format conversation history for Gemini API
    const chatHistory = conversation.messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));
    
    // Start chat with existing history
    const chat = modelToUse.startChat({
      history: chatHistory,
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      }
    });
    
    // Add user message to conversation
    conversation.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date()
    });
    
    // Get response from AI
    const result = await chat.sendMessage(message);
    const response = await result.response;
    const aiReply = response.text();
    
    // Add AI response to conversation
    conversation.messages.push({
      role: 'assistant',
      content: aiReply,
      timestamp: new Date()
    });
    
    // Update conversation metadata
    conversation.lastUpdated = new Date();
    conversation.model = modelName; // Update the model if it changed
    
    // Save the updated conversation
    await conversation.save();
    
    res.status(200).json({
      success: true,
      data: {
        conversation: {
          id: conversation._id,
          title: conversation.title,
          messages: conversation.messages,
          lastUpdated: conversation.lastUpdated,
          model: modelName
        },
        latestMessage: aiReply
      }
    });
  } catch (error) {
    console.error('Error continuing conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Delete a specific conversation
// @route   DELETE /api/ai/conversations/:conversationId
// @access  Private
exports.deleteConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    // Validate the conversation ID
    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: 'Conversation ID is required'
      });
    }
    
    // Find the conversation by ID and user
    const conversation = await Conversation.findOne({
      _id: conversationId,
      user: req.user.id
    });
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found or you do not have permission to delete it'
      });
    }
    
    // Delete the conversation
    await Conversation.findByIdAndDelete(conversationId);
    
    res.status(200).json({
      success: true,
      message: 'Conversation deleted successfully',
      data: { id: conversationId }
    });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Delete all conversations for the current user
// @route   DELETE /api/ai/conversations
// @access  Private
exports.deleteAllConversations = async (req, res) => {
  try {
    // Find all conversations for the current user
    const result = await Conversation.deleteMany({ user: req.user.id });
    
    res.status(200).json({
      success: true,
      message: 'All conversations deleted successfully',
      data: { count: result.deletedCount }
    });
  } catch (error) {
    console.error('Error deleting all conversations:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Helper function to generate a unique ID for conversations
function generateUniqueId() {
  return 'conv_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}