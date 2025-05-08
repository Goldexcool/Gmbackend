const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { textModel, complexModel } = require('../utils/aiModels');
const Conversation = require('../models/Conversation');

const API_VERSION = "v1beta";

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
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});

// Initialize upload with proper configuration for documents
const upload = multer({
  storage: storage,
  limits: { fileSize: 10000000 }, // 10MB limit
  fileFilter: function (req, file, cb) {
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

    let result, response, generatedText, modelUsed;
    
    // Try with complex model first (Gemini 1.5 Pro)
    try {
      result = await complexModel.generateContent(quizPrompt);
      response = result.response;
      generatedText = response.text();
      modelUsed = "gemini-1.5-pro";
      console.log("Successfully used gemini-1.5-pro for quiz generation");
    } catch (proError) {
      // If we hit rate limits, try with the textModel (Gemini 1.5 Flash)
      if (proError.message.includes("429") || proError.message.includes("quota")) {
        console.log("Rate limited on Pro model, falling back to Flash model...");
        try {
          result = await textModel.generateContent(quizPrompt);
          response = result.response;
          generatedText = response.text();
          modelUsed = "gemini-1.5-flash";
          console.log("Successfully used gemini-1.5-flash as fallback");
        } catch (flashError) {
          // If both models fail, try a simpler prompt
          if (flashError.message.includes("429") || flashError.message.includes("quota")) {
            console.log("Rate limited on both models, using simplified prompt...");
            
            // Simplified prompt with fewer questions
            const simplifiedPrompt = `
              Create a ${difficulty} difficulty quiz with 3 questions about:
              ${content.substring(0, 1000)}
              
              Format as JSON with: question_text, options (array), correct_answer (index), and explanation.
            `;
            
            try {
              result = await textModel.generateContent(simplifiedPrompt);
              response = result.response;
              generatedText = response.text();
              modelUsed = "gemini-1.5-flash (simplified)";
            } catch (finalError) {
              // If all attempts fail, return a custom error with retry info
              const waitTime = extractRetryDelay(finalError.message) || "60 seconds";
              return res.status(429).json({
                success: false,
                message: "API rate limit exceeded",
                error: `Please try again in ${waitTime}`,
                retryAfter: waitTime
              });
            }
          } else {
            throw flashError; // Re-throw if it's not a rate limit error
          }
        }
      } else {
        throw proError; // Re-throw if it's not a rate limit error
      }
    }

    // Extract JSON from response
    const jsonMatch = generatedText.match(/```json\n([\s\S]*?)\n```/) ||
      generatedText.match(/\[\n\s*\{[\s\S]*\}\n\]/);

    let quiz;
    if (jsonMatch && jsonMatch[1]) {
      try {
        quiz = JSON.parse(jsonMatch[1]);
      } catch (e) {
        console.error('Failed to parse quiz JSON', e);
        // Try to parse the entire text if the regex match failed
        try {
          const possibleJson = generatedText.match(/\[\s*\{[\s\S]*\}\s*\]/);
          if (possibleJson) {
            quiz = JSON.parse(possibleJson[0]);
          } else {
            quiz = { raw: generatedText };
          }
        } catch (e2) {
          quiz = { raw: generatedText };
        }
      }
    } else {
      // Try direct parsing if regex matching fails
      try {
        quiz = JSON.parse(generatedText);
      } catch (e) {
        quiz = { raw: generatedText };
      }
    }

    res.status(200).json({
      success: true,
      model: modelUsed,
      data: {
        quiz,
        noteAboutModel: modelUsed !== "gemini-1.5-pro" ? 
          "Used fallback model due to rate limits on Pro model" : undefined
      }
    });
  } catch (error) {
    console.error("Quiz generation error:", error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Helper function to extract retry delay from error message
function extractRetryDelay(errorMessage) {
  const match = errorMessage.match(/retryDelay\":\"(\d+)s\"/);
  if (match && match[1]) {
    return `${match[1]} seconds`;
  }
  return null;
}

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
      fileFilter: function (req, file, cb) {
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
    console.error('Error in quickChat:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Start a new AI conversation
// @route   POST /api/ai/conversations/start
// @access  Private
exports.startConversation = async (req, res) => {
  try {
    const { initialMessage, useComplexModel, title } = req.body;

    if (!initialMessage) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an initial message'
      });
    }

    // Select model
    const model = useComplexModel ? complexModel : textModel;
    const modelName = useComplexModel ? 'gemini-1.5-pro' : 'gemini-1.5-flash';

    console.log(`Starting conversation with model: ${modelName}`);

    // Generate AI response
    const result = await model.generateContent(initialMessage);
    const response = await result.response;
    const aiReply = response.text();

    // Create suggested name
    let suggestedName = title || `New Conversation`;

    // Create and save the conversation to database
    const newConversation = new Conversation({
      user: req.user.id,
      title: suggestedName,
      model: modelName,
      messages: [
        {
          role: 'user',
          content: initialMessage,  // Ensure this field is defined 
          timestamp: new Date(),
          read: true
        },
        {
          role: 'assistant',
          content: aiReply,  // Ensure this field is defined
          timestamp: new Date(),
          read: false
        }
      ],
    });

    await newConversation.save();

    res.status(201).json({
      success: true,
      data: newConversation
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

// @desc    Continue an AI conversation
// @route   POST /api/ai/conversations/:conversationId/continue
// @access  Private
exports.continueAiConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { message, useComplexModel } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, message: 'Please provide a message' });
    }

    const conversation = await Conversation.findOne({ _id: conversationId, user: req.user.id });
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    // ALWAYS use the complex model for better reasoning
    const modelName = 'gemini-1.5-pro';
    const modelToUse = complexModel;
    
    console.log(`Using model: ${modelName} for conversation: ${conversationId}`);

    // Get recent messages (up to 10 for context)
    const recentMessages = conversation.messages.slice(-10);

    // NEW APPROACH: Direct context injection without complicated analysis
    // First, identify subjects using a much simpler approach
    const simplifiedContext = getSimplifiedConversationContext(recentMessages, message);
    
    console.log("Conversation context:", JSON.stringify(simplifiedContext));
    
    // Build a more explicit prompt that focuses on clarity over complexity
    let prompt = "";

    // System Role and General Instructions
    prompt += "You are GemSpace AI, a helpful assistant for students and educators. Your primary goal is to provide accurate, relevant, and concise answers based on the conversation history and the user's current query.\n\n";

    // Explicit Subject Reference (if user said "by they I mean X")
    if (simplifiedContext.explicitSubjectReference) {
      prompt += `CONTEXTUAL NOTE: The user has explicitly stated that when they use pronouns like "they" or "them", they are referring to "${simplifiedContext.explicitSubjectReference}". You MUST use this information.\n\n`;
    }

    // Conversation History
    prompt += "CONVERSATION HISTORY (Oldest to Newest):\n";
    const historyLimit = Math.min(recentMessages.length, 5); // Show last 5 messages for brevity
    for (let i = Math.max(0, recentMessages.length - historyLimit); i < recentMessages.length; i++) {
      const msg = recentMessages[i];
      const speaker = msg.role === 'user' ? 'USER' : 'ASSISTANT';
      prompt += `${speaker}: ${msg.content}\n`; // FIX: Corrected closing backtick
    }
    prompt += "\n";

    // Current User Message
    prompt += `CURRENT USER MESSAGE:\nUSER: ${message}\n\n`;

    // --- CRITICAL PRONOUN RESOLUTION AND RESPONSE INSTRUCTIONS ---
    prompt += "INSTRUCTIONS FOR YOUR RESPONSE:\n";

    if (simplifiedContext.hasPronouns && simplifiedContext.mainSubject) {
      prompt += `1. The user's current message contains pronouns (e.g., "they", "them", "it").\n`;
      prompt += `2. In this specific context, these pronouns DIRECTLY AND EXPLICITLY refer to: "${simplifiedContext.mainSubject}".\n`;
      prompt += `3. Example: If the user asks "how do they influence the world", and the main subject is "${simplifiedContext.mainSubject}", you MUST interpret this as "how do ${simplifiedContext.mainSubject} influence the world".\n`;
      prompt += `4. CRITICAL: You MUST NOT ask for clarification about what "they" (or other pronouns) refer to. Assume they refer to "${simplifiedContext.mainSubject}".\n`;
      prompt += `5. Answer the question directly as if the user had explicitly named "${simplifiedContext.mainSubject}".\n`;
    } else {
      prompt += `1. Answer the user's question directly and comprehensively.\n`;
    }

    prompt += `6. Maintain a helpful and informative tone, consistent with an AI assistant for students and educators.\n`;
    prompt += `7. Keep responses focused on the user's query.\n\n`;

    prompt += "ASSISTANT RESPONSE:";

    // Add user message to conversation history
    const userMessage = {
      role: 'user',
      content: message,
      messageType: 'text',
      timestamp: new Date(),
      readBy: []
    };
    conversation.messages.push(userMessage);

    // NEW: Use a direct API call with simplified parameters
    const result = await modelToUse.generateContent(prompt);
    const response = result.response;
    const aiReply = response.text();

    // Add the AI response to conversation
    const aiMessage = {
      role: 'assistant',
      content: aiReply,
      messageType: 'text',
      timestamp: new Date(),
      readBy: []
    };
    conversation.messages.push(aiMessage);

    // Update metadata and save
    conversation.updatedAt = new Date();
    conversation.lastActivity = new Date();
    await conversation.save();

    res.status(200).json({
      success: true,
      data: conversation
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

// NEW: Get a simplified context that focuses on EXACTLY what we need
function getSimplifiedConversationContext(messages, currentMessage) {
  // Normalize common typos and archaic forms
  const normalizedMessage = currentMessage
    .replace(/\bthy\b/gi, 'they')
    .replace(/\bthier\b/gi, 'their')
    .replace(/\btehy\b/gi, 'they');

  const context = {
    mainSubject: null,
    hasPronouns: /\b(they|them|their|it|its)\b/i.test(normalizedMessage),
    explicitSubjectReference: null
  };

  // 1. Look for explicit subject in the current message
  const explicitMatch = normalizedMessage.match(/by\s+(they|them|it)\s+(i|we)\s+mean\s+([a-z ]+)/i);
  if (explicitMatch) {
    context.explicitSubjectReference = explicitMatch[3].trim().toLowerCase();
    context.mainSubject = context.explicitSubjectReference;
    return context;
  }

  // 2. Walk backwards through messages to find the last user subject question
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'user') {
      // Match "who are", "what is", etc.
      const subjMatch = msg.content.match(/(?:who (?:is|are)|what (?:is|are)|tell me about|define|explain)\s+([a-z ]+)/i);
      if (subjMatch) {
        context.mainSubject = subjMatch[1].trim().toLowerCase();
        break;
      }
      if (msg.content.toLowerCase().includes('computer scientist')) {
        context.mainSubject = 'computer scientists';
        break;
      }
      if (msg.content.toLowerCase().includes('engineer')) {
        context.mainSubject = 'engineers';
        break;
      }
    }
  }

  return context;
}

// NEW: Construct a clear prompt that focuses on explicit instructions
function constructClearPrompt(messages, currentMessage, context) {
  let prompt = "";

  // System Role and General Instructions
  prompt += "You are GemSpace AI, a helpful assistant for students and educators. Your primary goal is to provide accurate, relevant, and concise answers based on the conversation history and the user's current query.\n\n";

  // Explicit Subject Reference (if user said "by they I mean X")
  if (context.explicitSubjectReference) {
    prompt += `CONTEXTUAL NOTE: The user has explicitly stated that when they use pronouns like "they" or "them", they are referring to "${context.explicitSubjectReference}". You MUST use this information.\n\n`;
  }

  // Conversation History
  prompt += "CONVERSATION HISTORY (Oldest to Newest):\n";
  const historyLimit = Math.min(messages.length, 5); // Show last 5 messages for brevity
  for (let i = Math.max(0, messages.length - historyLimit); i < messages.length; i++) {
    const msg = messages[i];
    const speaker = msg.role === 'user' ? 'USER' : 'ASSISTANT';
    prompt += `${speaker}: ${msg.content}\n`; // FIX: Corrected closing backtick
  }
  prompt += "\n";

  // Current User Message
  prompt += `CURRENT USER MESSAGE:\nUSER: ${currentMessage}\n\n`;

  // --- CRITICAL PRONOUN RESOLUTION AND RESPONSE INSTRUCTIONS ---
  prompt += "INSTRUCTIONS FOR YOUR RESPONSE:\n";

  if (context.hasPronouns && context.mainSubject) {
    prompt += `1. The user's current message contains pronouns (e.g., "they", "them", "it").\n`;
    prompt += `2. In this specific context, these pronouns DIRECTLY AND EXPLICITLY refer to: "${context.mainSubject}".\n`;
    prompt += `3. Example: If the user asks "how do they influence the world", and the main subject is "${context.mainSubject}", you MUST interpret this as "how do ${context.mainSubject} influence the world".\n`;
    prompt += `4. CRITICAL: You MUST NOT ask for clarification about what "they" (or other pronouns) refer to. Assume they refer to "${context.mainSubject}".\n`;
    prompt += `5. Answer the question directly as if the user had explicitly named "${context.mainSubject}".\n`;
  } else {
    prompt += `1. Answer the user's question directly and comprehensively.\n`;
  }

  prompt += `6. Maintain a helpful and informative tone, consistent with an AI assistant for students and educators.\n`;
  prompt += `7. Keep responses focused on the user's query.\n\n`;

  prompt += "ASSISTANT RESPONSE:";
  return prompt;
}

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

// @desc    Continue conversation
// @route   POST /api/conversations/:conversationId/messages
// @access  Private
exports.continueAiConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { message, useComplexModel } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, message: 'Please provide a message' });
    }

    const conversation = await Conversation.findOne({ _id: conversationId, user: req.user.id });
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    // IMPORTANT: Always use the complex model for better reasoning capabilities
    const modelToUse = complexModel; // Force using Pro model for better context handling
    const modelName = 'gemini-1.5-pro';
    console.log(`Using model: ${modelName} for conversation: ${conversationId}`);

    // Get recent messages (last 10)
    const recentMessages = conversation.messages.slice(-10);
    
    // ------ SIMPLIFIED SUBJECT TRACKING ------
    // Extract the main subjects from the conversation
    const subjects = extractConversationSubjects(recentMessages);
    const mainSubject = subjects.length > 0 ? subjects[0] : null;
    
    console.log(`Extracted subjects: ${JSON.stringify(subjects)}`);
    console.log(`Main subject: ${mainSubject}`);
    
    // ------ CREATE A COMPREHENSIVE SINGLE PROMPT ------
    let fullPrompt = "";
    
    // Add system instructions
    fullPrompt += "You are GemSpace AI, a helpful assistant for students and educators. " +
                 "Your responses should be informative, accurate, and tailored to the user's needs.\n\n";
    
    // ------ CREATE EXPLICIT CONVERSATION HISTORY ------
    fullPrompt += "CONVERSATION HISTORY:\n\n";
    
    recentMessages.forEach((msg, index) => {
      if (msg.role === 'user') {
        fullPrompt += `USER: ${msg.content}\n\n`;
      } else if (msg.role === 'assistant') {
        fullPrompt += `ASSISTANT: ${msg.content}\n\n`;
      }
    });
    
    // ------ ADD EXPLICIT SUBJECT TRACKING ------
    fullPrompt += "CONVERSATION CONTEXT:\n";
    
    if (mainSubject) {
      fullPrompt += `The conversation is primarily discussing ${mainSubject}.\n`;
      fullPrompt += `Any pronouns like 'they', 'them', 'their', etc. should be understood to refer to ${mainSubject} unless obviously referring to something else.\n\n`;
    }
    
    // ------ ADD CURRENT MESSAGE WITH EXPLICIT PRONOUN INSTRUCTIONS ------
    fullPrompt += "CURRENT MESSAGE:\n";
    fullPrompt += `USER: ${message}\n\n`;
    
    // Check if message contains pronouns
    const hasPronouns = /\b(they|them|their|it|its)\b/i.test(message);
    
    if (hasPronouns && mainSubject) {
      fullPrompt += `NOTE: In the user's message, the pronouns (they/them/their) are referring to ${mainSubject}.\n\n`;
    }
    
    // ------ DIRECT INSTRUCTION FOR RESPONSE ------
    fullPrompt += "YOUR RESPONSE:\n";
    fullPrompt += "Remember to maintain conversation context. ";
    
    if (mainSubject) {
      fullPrompt += `If the user asks about 'they' or 'them', assume they're referring to ${mainSubject} unless clearly indicated otherwise. `;
    }
    
    fullPrompt += "Answer the question directly and provide relevant information.\n\n";
    
    // Add the user message to the conversation
    const userMessage = {
      role: 'user',
      content: message,
      messageType: 'text',
      timestamp: new Date(),
      readBy: []
    };
    conversation.messages.push(userMessage);
    
    // ------ GENERATE THE RESPONSE ------
    console.log(`Sending prompt with length: ${fullPrompt.length} characters`);
    console.log(`Context detected: ${mainSubject || "No specific subject"}`);
    
    // Generate AI response with improved context
    const result = await modelToUse.generateContent({
      contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      }
    });
    
    const response = result.response;
    let aiReply = response.text();
    
    // Remove prefixes if the AI included them
    aiReply = aiReply.replace(/^ASSISTANT:\s*/i, '');
    
    // Add AI response to conversation
    const aiMessage = {
      role: 'assistant',
      content: aiReply,
      messageType: 'text',
      timestamp: new Date(),
      readBy: []
    };
    conversation.messages.push(aiMessage);
    
    // Update conversation metadata
    conversation.updatedAt = new Date();
    conversation.lastActivity = new Date();
    await conversation.save();
    
    res.status(200).json({ success: true, data: conversation });
  } catch (error) {
    console.error('Error continuing conversation:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Simplified function to extract the main subjects from conversation
function extractConversationSubjects(messages) {
  const subjects = [];
  const subjectKeywords = {
    'mechatronics engineers': ['mechatronics engineer', 'mechatronics', 'mechatronic'],
    'engineers': ['engineer', 'engineering', 'engineers'],
    'computer scientists': ['computer scientist', 'computer science', 'computer scientists'],
    'data scientists': ['data scientist', 'data science', 'data scientists'],
    'developers': ['developer', 'developers', 'software developer'],
    'programmers': ['programmer', 'programmers', 'coding'],
  };

  // 1. Check for explicit subject declaration (highest priority)
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'user') {
      const content = msg.content.toLowerCase();
      const explicitMatch = content.match(/by (?:they|them|it) (?:i|we) mean\s+([a-z ]+)/i);
      if (explicitMatch) {
        const explicitSubject = explicitMatch[1].trim();
        for (const [subject, keywords] of Object.entries(subjectKeywords)) {
          if (keywords.some(kw => explicitSubject.includes(kw))) {
            return [subject];
          }
        }
        return [explicitSubject];
      }
    }
  }

  // 2. Walk backwards for the most recent subject question
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'user') {
      // Match "who are", "what is", etc.
      const subjMatch = msg.content.match(/(?:who (?:is|are)|what (?:is|are)|tell me about|define|explain)\s+([a-z ]+)/i);
      if (subjMatch) {
        const found = subjMatch[1].trim().toLowerCase();
        // Try to map to a known subject
        for (const [subject, keywords] of Object.entries(subjectKeywords)) {
          if (keywords.some(kw => found.includes(kw))) {
            return [subject];
          }
        }
        return [found];
      }
      // Fallback: check for keywords
      for (const [subject, keywords] of Object.entries(subjectKeywords)) {
        if (keywords.some(kw => msg.content.toLowerCase().includes(kw))) {
          if (!subjects.includes(subject)) {
            subjects.unshift(subject);
          }
        }
      }
    }
  }

  return subjects;
}

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

// @desc    Get messages for a conversation
// @route   GET /api/connections/conversations/:conversationId/messages
// @access  Private
exports.getConversationMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Find conversation
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Check if user is a participant in the conversation
    const isParticipant = conversation.participants.some(
      p => p.toString() === req.user.id
    );

    if (!isParticipant) {
      console.log('User not authorized:', req.user.id);
      console.log('Conversation participants:', conversation.participants);

      return res.status(403).json({
        success: false,
        message: 'You are not authorized to access this conversation'
      });
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get messages with pagination (newest first)
    const messages = await Message.find({
      conversation: conversationId
    })
      .populate('sender', 'fullName avatar profileImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Automatically mark unread messages as read if sent by other user
    const unreadMessagesIds = messages
      .filter(msg => !msg.read && msg.sender._id.toString() !== req.user.id)
      .map(msg => msg._id);

    if (unreadMessagesIds.length > 0) {
      await Message.updateMany(
        { _id: { $in: unreadMessagesIds } },
        {
          read: true,
          readAt: Date.now()
        }
      );

      // If the last message was unread, update conversation's lastMessage.read status
      if (conversation.lastMessage &&
        conversation.lastMessage.sender &&
        conversation.lastMessage.sender.toString() !== req.user.id &&
        conversation.lastMessage.read === false) {
        conversation.lastMessage.read = true;
        await conversation.save();
      }
    }

    // Get total count for pagination
    const total = await Message.countDocuments({ conversation: conversationId });

    // Get the other participant
    const otherParticipantId = conversation.participants.find(
      p => p.toString() !== req.user.id
    );

    // Get other participant's details if available
    let otherUser = null;
    if (otherParticipantId) {
      otherUser = await User.findById(otherParticipantId)
        .select('fullName email profileImage avatar');
    }

    res.status(200).json({
      success: true,
      count: messages.length,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      },
      data: {
        messages,
        otherUser
      }
    });
  } catch (error) {
    console.error('Error getting conversation messages:', error);
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