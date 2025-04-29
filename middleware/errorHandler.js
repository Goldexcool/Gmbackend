// middleware/errorHandler.js
const errorHandler = (err, req, res, next) => {
  console.error('ERROR:', err.name, err.message);
  console.error(err.stack);

  // Default error status and message
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = {};
  
  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    // Create a structured errors object
    Object.keys(err.errors).forEach(key => {
      errors[key] = err.errors[key].message;
    });
    message = 'Invalid input data';
  }
  
  // Handle Mongoose duplicate key errors
  if (err.code === 11000) {
    statusCode = 400;
    const field = Object.keys(err.keyValue)[0];
    message = `Duplicate value entered for ${field} field`;
    errors[field] = `${field} already exists`;
  }
  
  // Handle Mongoose cast errors
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
    errors[err.path] = message;
  }
  
  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication token';
  }
  
  // Handle JWT expiration
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Your login session has expired';
  }

  // AI API errors
  if (err.message && err.message.includes('GoogleGenerativeAI Error')) {
    statusCode = 503;
    message = 'AI service temporarily unavailable';
  }

  const response = {
    success: false,
    message,
    ...(Object.keys(errors).length > 0 && { errors })
  };

  // Only include stack trace in development
  if (process.env.NODE_ENV !== 'production') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;