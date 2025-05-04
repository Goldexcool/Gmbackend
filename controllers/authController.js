const User = require('../models/User');
const Student = require('../models/Student');
const Lecturer = require('../models/Lecturer');
const Admin = require('../models/Admin');
const AcademicSession = require('../models/AcademicSession');
const Course = require('../models/Course');
const Department = require('../models/Department'); // Added Department model
const jwt = require('jsonwebtoken');  
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');
const emailService = require('../services/emailService');
const { formatDepartmentInfo } = require('../utils/responseHelpers'); 

// Validate email format before sending
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { 
      fullName, 
      email, 
      password, 
      role = 'student', 
      matricNumber,
      department,  // This will now be a name like "Computer Science"
      level
    } = req.body;

    // Validate required fields
    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }

    // Additional validation for students
    if (role === 'student') {
      if (!department || !level) {
        return res.status(400).json({
          success: false,
          message: 'Please provide department and level for student registration'
        });
      }
      
      // Validate level format (e.g., 100, 200, 300, etc.)
      const levelRegex = /^[1-9][0-9]{2}$/;
      if (!levelRegex.test(level)) {
        return res.status(400).json({
          success: false,
          message: 'Level must be a valid academic level (e.g., 100, 200, 300, etc.)'
        });
      }
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Find department by name (case-insensitive) instead of by ID
    let departmentId = null;
    if (department) {
      const departmentDoc = await Department.findOne({
        name: { $regex: new RegExp(`^${department}$`, 'i') }
      });

      if (!departmentDoc) {
        return res.status(404).json({
          success: false,
          message: `Department "${department}" not found. Please check the department name.`
        });
      }
      
      departmentId = departmentDoc._id;
    }

    // Create the user
    const user = await User.create({
      fullName,
      email,
      password,
      role
    });

    // Create role-specific profile
    if (role === 'student') {
      await Student.create({
        user: user._id,
        matricNumber,
        department: departmentId,
        level: parseInt(level),
        courses: []
      });
      
      // Auto-assign courses that match the student's department and level
      await autoAssignCourses(user._id, departmentId, level);
    } else if (role === 'lecturer') {
      await Lecturer.create({
        user: user._id
      });
    } else if (role === 'admin') {
      await Admin.create({ user: user._id });
    }

    // Generate token
    const token = user.getSignedJwtToken();

    const verificationToken = user.getEmailVerificationToken();
    user.verificationTokenExpire = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    await user.save();

    // Send welcome email with verification link
    await emailService.sendWelcomeEmail(email, fullName);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Error registering user',
      error: error.message
    });
  }
};

// Helper function to auto-assign courses based on department and level
const autoAssignCourses = async (userId, department, level) => {
  try {
    // Find the active academic session
    const activeSession = await AcademicSession.findOne({ isActive: true });
    if (!activeSession) {
      console.log('No active academic session found for course auto-assignment');
      return;
    }

    // Find matching courses
    const courses = await Course.find({
      department,
      level,
      academicSession: activeSession._id,
      isActive: true,
      isCompulsory: true // Only assign compulsory courses automatically
    });

    if (courses.length > 0) {
      // Find student document
      const student = await Student.findOne({ user: userId });
      
      // Add course IDs to student's courses array
      student.courses.push(...courses.map(course => course._id));
      
      // Save student with assigned courses
      await student.save();
      
      console.log(`Auto-assigned ${courses.length} courses to student ${userId}`);
    }
  } catch (error) {
    console.error('Error auto-assigning courses:', error);
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate email and password
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Check if user exists
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if password is correct
    try {
      const isPasswordValid = await user.matchPassword(password);
      
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }
    } catch (passwordError) {
      console.error('Password validation error:', passwordError);
      return res.status(500).json({
        success: false,
        message: 'Error validating credentials'
      });
    }

    // Update last login
    user.lastLogin = Date.now();
    await user.save({ validateBeforeSave: false });

    // Create token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || 'temporary_secret_key',
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    // Set cookie for JWT
    const cookieOptions = {
      expires: new Date(
        Date.now() + (parseInt(process.env.JWT_COOKIE_EXPIRES_IN) || 30) * 24 * 60 * 60 * 1000
      ),
      httpOnly: true
    };

    // Use secure cookies in production
    if (process.env.NODE_ENV === 'production') {
      cookieOptions.secure = true;
    }

    res.cookie('token', token, cookieOptions);

    // Remove password from response
    user.password = undefined;

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        passwordChangeRequired: user.passwordChangeRequired
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    let profile = null;
    
    // Get role-specific profile
    if (user.role === 'student') {
      profile = await Student.findOne({ user: user._id })
        .populate('department', 'name code faculty')  // Make sure to populate with these fields
        .populate('courses', 'code title credits');
      
      // Convert profile to plain object so we can add properties
      if (profile) {
        const profileObj = profile.toObject();
        
        // Add department info as a separate property to avoid overwriting the original
        if (profileObj.department) {
          if (typeof profileObj.department === 'object' && profileObj.department.name) {
            // If department is already populated
            profileObj.departmentInfo = {
              id: profileObj.department._id,
              name: profileObj.department.name,
              code: profileObj.department.code || null,
              faculty: profileObj.department.faculty || null
            };
          } else {
            // If not populated, fetch department info
            try {
              const departmentDoc = await Department.findById(profileObj.department);
              if (departmentDoc) {
                profileObj.departmentInfo = {
                  id: departmentDoc._id,
                  name: departmentDoc.name,
                  code: departmentDoc.code || null,
                  faculty: departmentDoc.faculty || null
                };
              }
            } catch (err) {
              console.warn('Could not fetch department info:', err);
            }
          }
        }
        
        profile = profileObj;
      }
    } else if (user.role === 'lecturer') {
      profile = await Lecturer.findOne({ user: user._id })
        .populate('department', 'name code faculty')
        .populate('courses', 'code title');
        
      // Do the same for lecturer if needed
      if (profile) {
        const profileObj = profile.toObject();
        // Similar department info processing...
        profile = profileObj;
      }
    } else if (user.role === 'admin') {
      profile = await Admin.findOne({ user: user._id });
    }
    
    res.status(200).json({
      success: true,
      data: {
        user,
        profile
      }
    });
  } catch (error) {
    console.error('Error getting current user:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting current user',
      error: error.message
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/update-profile
// @access  Private
exports.updateProfile = async (req, res) => {
  try {
    const { fullName, bio, avatar, phoneNumber } = req.body;

    // Find user
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update user details
    user.fullName = fullName || user.fullName;
    user.bio = bio || user.bio;
    user.avatar = avatar || user.avatar;
    user.phoneNumber = phoneNumber || user.phoneNumber;

    await user.save();

    res.status(200).json({
      success: true,
      data: {
        user
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Get user with current password
    const user = await User.findById(req.user.id).select('+password');

    // Check current password
    const isPasswordValid = await user.matchPassword(currentPassword);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an email address'
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No user found with that email address'
      });
    }

    // Get reset token
    const resetToken = user.getResetPasswordToken();
    await user.save({ validateBeforeSave: false });

    // Send reset password email
    const result = await emailService.sendPasswordResetEmail(user.email, resetToken);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Password reset email sent'
      });
    } else {
      // If email fails, reset the token fields to prevent a locked account
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });

      res.status(500).json({
        success: false,
        message: 'Email could not be sent',
        error: result.error
      });
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while processing password reset',
      error: error.message
    });
  }
};

// @desc    Reset password
// @route   POST /api/auth/reset-password/:resetToken
// @access  Public
exports.resetPassword = async (req, res) => {
  try {
    const { password, confirmPassword } = req.body;
    const { resetToken } = req.params;

    // Validate passwords
    if (!password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide new password and confirm password'
      });
    }

    // Check if passwords match
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match'
      });
    }

    // Get hashed token
    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Find user by reset token
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Set new password
    user.password = password;
    
    // Clear reset token fields
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    // Return token for automatic login
    const token = user.getSignedJwtToken();

    res.status(200).json({
      success: true,
      message: 'Password reset successfully',
      token // Allow immediate login after reset
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while resetting password',
      error: error.message
    });
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const { verificationToken } = req.params;

    // Get hashed token
    const emailVerificationToken = crypto
      .createHash('sha256')
      .update(verificationToken)
      .digest('hex');

    // Find user by verification token
    const user = await User.findOne({ emailVerificationToken });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification token'
      });
    }

    // Set user as verified
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Email verified successfully'
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    // Get user
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Create new access token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.status(200).json({
      success: true,
      token
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid or expired refresh token'
    });
  }
};


exports.logout = (req, res) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
};

// @desc    Send email verification code
// @route   POST /api/auth/send-verification
// @access  Public
exports.sendVerificationCode = async (req, res) => {
  try {
    const { email, purpose = 'account' } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an email address'
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No user found with that email address'
      });
    }

    // Use emailService to send verification code
    const result = await emailService.sendVerificationCode(user.email, purpose);

    if (result.success) {
      // Store the verification code and expiration in the user record
      user.verificationCode = result.verificationCode;
      
      // Set expiration time (15 minutes)
      user.verificationCodeExpire = Date.now() + 15 * 60 * 1000;
      
      await user.save();

      res.status(200).json({
        success: true,
        message: 'Verification code sent successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Email could not be sent',
        error: result.error
      });
    }
  } catch (error) {
    console.error('Send verification code error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while sending verification code',
      error: error.message
    });
  }
};

/**
 * @desc    Verify email code
 * @route   POST /api/auth/verify-code
 * @access  Public
 */
exports.verifyCode = async (req, res) => {
  try {
    const { email, code, purpose = 'account' } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and verification code'
      });
    }

    const user = await User.findOne({
      email,
      verificationCode: code,
      verificationCodeExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code'
      });
    }

    // Handle different verification purposes
    switch (purpose) {
      case 'account':
        // Mark the user as verified
        user.isVerified = true;
        break;
      
      case 'password-reset':
        // For password reset, we'll just validate the code
        // Actual password reset will happen in resetPassword endpoint
        break;
      
      case 'login':
        // For login verification, we'll generate a token
        const token = user.getSignedJwtToken();
        break;
    }

    // Clear the verification code
    user.verificationCode = undefined;
    user.verificationCodeExpire = undefined;
    
    await user.save();

    // Respond based on purpose
    if (purpose === 'login') {
      // Return token for login purpose
      res.status(200).json({
        success: true,
        message: 'Verification successful',
        token
      });
    } else {
      // For other purposes
      res.status(200).json({
        success: true,
        message: 'Verification successful'
      });
    }
  } catch (error) {
    console.error('Verify code error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while verifying code',
      error: error.message
    });
  }
};