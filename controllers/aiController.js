const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const getGeminiModel = () => {
  try {
    return genAI.getGenerativeModel({ model: "gemini-pro" });
  } catch (error) {
    console.error('Error initializing Gemini model:', error);
    return null;
  }
};


exports.generateText = async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        message: 'Prompt is required'
      });
    }

    const model = getGeminiModel();
    
    if (!model) {
      return res.status(500).json({
        success: false,
        message: 'AI model initialization failed'
      });
    }

    // Generate content
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    res.status(200).json({
      success: true,
      data: {
        text
      }
    });
  } catch (error) {
    console.error('AI text generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating AI content',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


exports.generateQuiz = async (req, res) => {
  try {
    const { topic, difficulty = 'medium', numberOfQuestions = 5 } = req.body;
    
    if (!topic) {
      return res.status(400).json({
        success: false,
        message: 'Topic is required'
      });
    }

    const model = getGeminiModel();
    
    if (!model) {
      return res.status(500).json({
        success: false,
        message: 'AI model initialization failed'
      });
    }

    const prompt = `
      Create a quiz about "${topic}" with ${numberOfQuestions} questions at ${difficulty} difficulty level.
      Format the response as JSON with this structure:
      {
        "questions": [
          {
            "question": "Question text here",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "correctAnswer": "The correct option here",
            "explanation": "Brief explanation of the answer"
          }
        ]
      }
      Make sure all questions are factually accurate and educational.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    let quizData;
    try {
      // Try to extract JSON if it's wrapped in code blocks
      const jsonMatch = text.match(/```(?:json)?([\s\S]*?)```/);
      const jsonString = jsonMatch ? jsonMatch[1].trim() : text;
      quizData = JSON.parse(jsonString);
    } catch (jsonError) {
      console.error('Error parsing quiz JSON:', jsonError);
      return res.status(500).json({
        success: false,
        message: 'Error parsing AI-generated quiz',
        rawText: text
      });
    }

    res.status(200).json({
      success: true,
      data: quizData
    });
  } catch (error) {
    console.error('AI quiz generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating quiz'
    });
  }
};