const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize the Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Get supported models
const getModels = async () => {
  const modelList = await genAI.getGenerativeModel({ model: "models/gemini-pro" });
  return modelList;
};

// Initialize the model
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

module.exports = { genAI, model, getModels };