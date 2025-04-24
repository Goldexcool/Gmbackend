const User = require('../models/User');
const Student = require('../models/Student');
const Lecturer = require('../models/Lecturer');
const Admin = require('../models/Admin');
const jwt = require('jsonwebtoken');  
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { fullName, email, password, role = 'student', matricNumber } = req.body;

    // Validate required fields
    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Create new user
    const user = new User({
      fullName,
      email,
      password,
      role
    });

    // Save user to database
    await user.save();

    // Create profile based on role
    if (role === 'student') {
      // Only set matricNumber if provided
      const studentData = { user: user._id };
      if (matricNumber) {
        // Check if matricNumber is already in use
        const existingStudent = await Student.findOne({ matricNumber });
        if (existingStudent) {
          await User.findByIdAndDelete(user._id); // Cleanup the user we just created
          return res.status(400).json({
            success: false,
            message: 'A student with this matric number already exists'
          });
        }
        studentData.matricNumber = matricNumber;
      }
      await Student.create(studentData);
    } else if (role === 'lecturer') {
      await Lecturer.create({ user: user._id });
    } else if (role === 'admin') {
      await Admin.create({ user: user._id });
    }

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

    res.status(201).json({
      success: true,
      token,
      data: {
        user
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
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
      data: {
        user
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

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getCurrentUser = async (req, res) => {
  try {
    // Get user details
    const user = await User.findById(req.user.id);

    // Get role-specific profile
    let profile;
    if (user.role === 'student') {
      profile = await Student.findOne({ user: user._id })
        .populate('courses', 'name code')
        .populate('connections', 'user');
    } else if (user.role === 'lecturer') {
      profile = await Lecturer.findOne({ user: user._id })
        .populate('courses', 'name code');
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
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
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

    const resetToken = user.getResetPasswordToken();
    await user.save({ validateBeforeSave: false });

    const appResetUrl = `gemspace://reset-password?token=${resetToken}`;
    const webResetUrl = `http://localhost:3000/reset-password/${resetToken}`;

    // Prepare email content
    const subject = 'GEM-SPACE Password Reset';
    const message = `Hello ${user.fullName},\n\nYou requested a password reset. Please use this code in the GEM-SPACE app:\n\n${resetToken}\n\nOr click this link if you're on a mobile device with the app installed: ${appResetUrl}\n\nThis code will expire in 10 minutes.\n\nIf you did not request this, please ignore this email and your password will remain unchanged.\n\nThank you,\nThe GEM-SPACE Team`;

    // HTML email template with both deep link and code
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #4f46e5; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">GEM-SPACE</h1>
        </div>
        <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
          <h2 style="color: #111827;">Password Reset</h2>
          <p style="color: #4b5563;">Hello ${user.fullName},</p>
          <p style="color: #4b5563;">You requested a password reset for your GEM-SPACE account.</p>
          
          <p style="color: #4b5563;"><strong>If you're using the mobile app</strong>, enter this code in the password reset screen:</p>
          <div style="text-align: center; margin: 20px 0;">
            <div style="background-color: #f3f4f6; padding: 15px; border-radius: 4px; font-size: 18px; font-weight: bold; letter-spacing: 2px; display: inline-block;">
              ${resetToken}
            </div>
          </div>
          
          <p style="color: #4b5563;"><strong>On your mobile device</strong>, you can also try tapping this button:</p>
          <div style="text-align: center; margin: 20px 0;">
            <a href="${appResetUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">Open in GEM-SPACE App</a>
          </div>
          
          <p style="color: #4b5563;"><strong>Or if you're on a computer</strong>, use this link:</p>
          <div style="text-align: center; margin: 20px 0;">
            <a href="${webResetUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">Reset Password</a>
          </div>
          
          <p style="color: #4b5563;">This code and links will expire in 10 minutes.</p>
          <p style="color: #4b5563;">If you did not request this reset, please ignore this email and your password will remain unchanged.</p>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 0.875rem;">
            <p>Thank you,<br>The GEM-SPACE Team</p>
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </div>
    `;

    try {
      // Send email
      await sendEmail({
        to: user.email,
        subject,
        text: message,
        html
      });

      res.status(200).json({
        success: true,
        message: 'Password reset email sent'
      });
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });

      return res.status(500).json({
        success: false,
        message: 'Email could not be sent. Please try again later.'
      });
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { password } = req.body;
    const { resetToken } = req.params;

    // Get hashed token
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Find user by reset token and check if token is expired
    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // Set new password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    // Create new token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.status(200).json({
      success: true,
      message: 'Password reset successful',
      token
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
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