const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - verify token and attach user to request
exports.protect = async (req, res, next) => {
  try {
    let token;
    
    // Get token from Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      // Extract token from Bearer token string
      token = req.headers.authorization.split(' ')[1];
    } 
    // Check for token in cookies (optional)
    else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }
    
    // Check if token exists
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }
    
    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Find user by ID
      const user = await User.findById(decoded.id);
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Attach user to request
      req.user = {
        id: user._id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        passwordChangeRequired: user.passwordChangeRequired
      };
      
      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Token is invalid or expired'
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error in authentication middleware'
    });
  }
};

// Authorize by role - restrict access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }
    
    next();
  };
};

// Verify email ownership - for operations that should only affect the user's own account
exports.verifyEmailOwnership = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'User not authenticated'
    });
  }
  
  // If user is an admin, allow access regardless
  if (req.user.role === 'admin') {
    return next();
  }
  
  // For email parameter in route
  if (req.params.email && req.params.email !== req.user.email) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to perform this action on another user'
    });
  }
  
  // For email in request body
  if (req.body.email && req.body.email !== req.user.email) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to perform this action with another user\'s email'
    });
  }
  
  next();
};

// Enforce password change - restrict access until password is changed
exports.enforcePasswordChange = async (req, res, next) => {
  try {
    // Get user from request (set by the protect middleware)
    const { passwordChangeRequired } = req.user;
    
    // Check if password change is required
    if (passwordChangeRequired) {
      // Allow only password change endpoints
      const allowedPaths = ['/api/users/change-password', '/api/users/profile'];
      
      if (!allowedPaths.includes(req.path)) {
        return res.status(403).json({
          success: false,
          message: 'Password change required before accessing this resource',
          requiresPasswordChange: true
        });
      }
    }
    
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};