// Utils module to provide Gemini AI model instances across the application
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch'); // Add this

// Initialize GoogleGenerativeAI with API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Text model - Gemini 1.5 Flash (faster, more efficient)
const textModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Complex model - Gemini 1.5 Pro (more powerful for complex reasoning)
const complexModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

module.exports = {
  textModel,
  complexModel
};