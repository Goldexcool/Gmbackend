/**
 * Middleware to restrict access to resources to only students and lecturers
 */
const studentLecturerOnly = (req, res, next) => {
  if (req.user && (req.user.role === 'student' || req.user.role === 'lecturer')) {
    next();
  } else {
    res.status(403).json({
      success: false,
      message: 'Access denied. Only students and lecturers can access educational resources.'
    });
  }
};

module.exports = { studentLecturerOnly };