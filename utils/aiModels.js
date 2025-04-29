// Utils module to provide Gemini AI model instances across the application
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini client with the correct API version
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, { apiVersion: "v1beta" });

// Configure working models based on test results
const textModel = genAI.getGenerativeModel({ 
  model: "gemini-1.5-flash"  // Faster, more efficient model for text
});

const complexModel = genAI.getGenerativeModel({ 
  model: "gemini-1.5-pro"  // More capable model for complex reasoning
});

module.exports = {
  genAI,
  textModel,
  complexModel
};