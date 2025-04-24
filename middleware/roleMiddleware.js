// middleware/roleMiddleware.js
exports.checkRole = (...roles) => {
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
          message: `User role ${req.user.role} is unauthorized to access this resource`
        });
      }
      
      next();
    };
  };