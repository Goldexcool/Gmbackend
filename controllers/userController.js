// controllers/userController.js
const Course = require('../models/Course');
const FAQ = require('../models/FAQ');
const Student = require('../models/Student');
const Lecturer = require('../models/Lecturer');

// @desc    Change password (including for first login)
// @route   PUT /api/users/change-password
// @access  Private
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide current and new password'
      });
    }
    
    const user = await User.findById(req.user.id).select('+password');
    
    // Verify current password
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }
    
    // Update password
    user.password = newPassword;
    
    // If this was a required change, mark as completed
    if (user.passwordChangeRequired) {
      user.passwordChangeRequired = false;
    }
    
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get all FAQs for users
// @route   GET /api/users/faqs
// @access  Private (All users)
exports.getAllFAQs = async (req, res) => {
  try {
    // Only get active FAQs
    const faqs = await FAQ.find({ isActive: true })
      .sort({ category: 1, order: 1 });
    
    res.status(200).json({
      success: true,
      count: faqs.length,
      data: faqs
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

// @desc    Get all departments for students
// @route   GET /api/users/departments
// @access  Private (All users)
exports.getDepartments = async (req, res) => {
  try {
    // Get unique departments from courses with active status
    const departments = await Course.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$department', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $match: { _id: { $ne: null } } }
    ]);
    
    res.status(200).json({
      success: true,
      count: departments.length,
      data: departments.map(dept => ({ 
        name: dept._id,
        courseCount: dept.count
      }))
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

// @desc    Get department details for students
// @route   GET /api/users/departments/:departmentName
// @access  Private (All users)
exports.getDepartmentDetails = async (req, res) => {
  try {
    const { departmentName } = req.params;
    
    // Get active courses for the department
    const courses = await Course.find({ 
      department: departmentName,
      isActive: true
    }).select('name code credits description semester level');
    
    if (courses.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Department '${departmentName}' not found or has no active courses`
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        name: departmentName,
        courses,
        courseCount: courses.length
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