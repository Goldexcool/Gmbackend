const nodemailer = require('nodemailer');
const sendEmail = require('../utils/sendEmail');
const generateVerificationCode = require('../utils/generateVerificationCode');

// Create a reusable transporter with Gmail
const getTransporter = () => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD 
    },
    tls: {
      rejectUnauthorized: false 
    }
  });
  
  // Verify connection configuration
  transporter.verify(function(error, success) {
    if (error) {
      console.error('SMTP connection error:', error);
    } else {
      console.log('SMTP server is ready to send emails');
    }
  });
  
  return transporter;
};

// Enhanced styling variables
const TEAL_COLOR = '#008080'; // Main teal green color
const TEAL_LIGHT = '#e0f2f1'; // Light teal for backgrounds
const TEAL_DARK = '#006666'; // Darker teal for accents
const GRAY_LIGHT = '#f5f7f9'; // Light gray for alternate backgrounds
const TEXT_DARK = '#263238'; // Dark text color
const TEXT_MEDIUM = '#546e7a'; // Medium text color

// Advanced styling
const STYLES = {
  container: `font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; max-width: 650px; margin: 0 auto; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.1); border: 1px solid #e0e0e0;`,
  header: `background: linear-gradient(135deg, ${TEAL_COLOR} 0%, ${TEAL_DARK} 100%); padding: 35px 40px 32px; text-align: center; position: relative;`,
  headerText: `color: white; font-size: 28px; font-weight: 600; margin: 0; letter-spacing: 0.3px;`,
  headerSubtext: `color: rgba(255,255,255,0.9); font-size: 15px; margin-top: 5px; font-weight: 400;`,
  body: `padding: 40px; background-color: white;`,
  footer: `background-color: ${GRAY_LIGHT}; padding: 25px; text-align: center; font-size: 13px; color: ${TEXT_MEDIUM}; border-top: 1px solid rgba(0,0,0,0.05);`,
  button: `display: inline-block; padding: 14px 28px; background: linear-gradient(to right, ${TEAL_COLOR}, ${TEAL_DARK}); color: white; text-decoration: none; border-radius: 50px; font-weight: 500; font-size: 16px; margin: 25px 0; box-shadow: 0 4px 12px rgba(0,128,128,0.15); transition: transform 0.2s;`,
  token: `font-size: 20px; background-color: ${GRAY_LIGHT}; padding: 16px; font-weight: 600; border-left: 4px solid ${TEAL_COLOR}; margin: 20px 0; letter-spacing: 1px; text-align: center; border-radius: 4px;`,
  sectionTitle: `font-size: 20px; color: ${TEAL_COLOR}; font-weight: 600; margin-top: 30px; margin-bottom: 15px;`,
  paragraph: `color: ${TEXT_DARK}; font-size: 16px; margin-bottom: 20px; line-height: 1.7;`,
  featureCard: `background-color: ${TEAL_LIGHT}; border-radius: 10px; padding: 20px; margin: 25px 0; border-left: 4px solid ${TEAL_COLOR};`,
  divider: `height: 1px; background: linear-gradient(to right, transparent, ${TEAL_LIGHT}, transparent); margin: 30px 0;`
};

// Advanced email with geometric accents for futuristic look
const emailBase = (content) => `
  <div style="${STYLES.container}">
    <!-- Header with geometric accent -->
    <div style="${STYLES.header}">
      <div style="position: absolute; top: 0; right: 0; width: 150px; height: 150px; background: radial-gradient(circle at top right, rgba(255,255,255,0.1) 0%, transparent 70%);"></div>
      <div style="position: absolute; bottom: -20px; left: -20px; width: 120px; height: 120px; border-radius: 50%; background-color: rgba(255,255,255,0.05);"></div>
      <h1 style="${STYLES.headerText}">GemSpace</h1>
      <p style="${STYLES.headerSubtext}">Learning. Simplified. Connected.</p>
    </div>
    
    <!-- Body content -->
    <div style="${STYLES.body}">
      ${content}
    </div>
    
    <!-- Footer -->
    <div style="${STYLES.footer}">
      <p>© ${new Date().getFullYear()} GemSpace. All rights reserved.</p>
      <p style="margin-top: 10px;">
        <a href="#" style="color: ${TEAL_COLOR}; text-decoration: none; margin: 0 10px;">Privacy Policy</a>
        <a href="#" style="color: ${TEAL_COLOR}; text-decoration: none; margin: 0 10px;">Terms of Service</a>
        <a href="#" style="color: ${TEAL_COLOR}; text-decoration: none; margin: 0 10px;">Contact Support</a>
      </p>
    </div>
  </div>
`;

/**
 * Send a password reset email with a token link
 * @param {string} email - Recipient email address
 * @param {string} resetToken - Password reset token
 * @returns {Promise<Object>} - Result with success status
 */
exports.sendPasswordResetEmail = async (email, resetToken) => {
  try {
    console.log('Sending password reset email to:', email);
    
    // Generate deep link URL for mobile app
    const mobileDeepLink = `gemspace://reset-password/${resetToken}`;
    
    // Fallback web URL
    const webResetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;
    
    const subject = 'GemSpace Password Reset';
    
    const html = emailBase(`
      <h2 style="${STYLES.sectionTitle}">Reset Your Password</h2>
      <p style="${STYLES.paragraph}">We received a request to reset your password.</p>
      
      <div style="${STYLES.featureCard}">
        <h3 style="margin-top: 0; color: ${TEAL_COLOR};">Tap the button below</h3>
        <p>If you're on your mobile device, tap this button to open the app:</p>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${mobileDeepLink}" style="${STYLES.button}">Reset Password in App</a>
        </div>
        <p style="font-size: 14px; color: ${TEXT_MEDIUM};">
          If the button doesn't work, make sure you have the GemSpace app installed.
        </p>
      </div>
      
      <div style="${STYLES.divider}"></div>
      
      <p style="${STYLES.paragraph}">This reset request will expire in 1 hour.</p>
      <p style="${STYLES.paragraph}">If you didn't request a password reset, you can safely ignore this email.</p>
    `);
    
    // Send email
    const sent = await sendEmail({
      to: email,
      subject,
      html
    });
    
    if (sent) {
      return { success: true };
    } else {
      return { success: false, error: 'Email could not be sent' };
    }
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send a welcome email to new users
 * @param {string} email - Recipient email address
 * @param {string} name - User's name
 * @returns {Promise<Object>} - Result with success status
 */
exports.sendWelcomeEmail = async (email, name) => {
  try {
    console.log('Attempting to send welcome email to:', email);
    
    // Email content
    const subject = 'Welcome to GEM-SPACE!';
    const text = `Hi ${name},\n\nWelcome to GEM-SPACE! We're excited to have you join our academic community.\n\nGet started by exploring courses, connecting with peers, and accessing resources.\n\nBest regards,\nThe GEM-SPACE Team`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #4CAF50; padding: 20px; text-align: center; color: white;">
          <h1>Welcome to GEM-SPACE!</h1>
        </div>
        <div style="padding: 20px; background-color: #f9f9f9; border: 1px solid #ddd;">
          <h2>Hi ${name},</h2>
          <p>We're excited to have you join our academic community!</p>
          <p>Here are a few things you can do to get started:</p>
          <ul>
            <li>Complete your profile</li>
            <li>Explore available courses</li>
            <li>Connect with peers and lecturers</li>
            <li>Access study resources</li>
          </ul>
          <p>If you have any questions, please don't hesitate to contact us.</p>
          <p>Best regards,<br>The GEM-SPACE Team</p>
        </div>
        <div style="padding: 10px; text-align: center; font-size: 12px; color: #666;">
          &copy; ${new Date().getFullYear()} GEM-SPACE. All rights reserved.
        </div>
      </div>
    `;
    
    // Send email
    const sent = await sendEmail({
      to: email,
      subject,
      text,
      html
    });
    
    if (sent) {
      console.log('Welcome email sent successfully');
      return { success: true };
    } else {
      console.error('Failed to send welcome email');
      return { 
        success: false, 
        error: 'Email could not be sent' 
      };
    }
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
};

/**
 * Send a verification code via email
 * @param {string} email - Recipient email address
 * @param {string} purpose - Purpose of verification (e.g., 'account', 'password-reset')
 * @returns {Promise<Object>} - Result with success status and verification code
 */
exports.sendVerificationCode = async (email, purpose = 'verification') => {
  try {
    console.log(`Sending ${purpose} code to: ${email}`);
    
    // Generate verification code
    const verificationCode = generateVerificationCode(6); // 6-digit code
    
    // Email content based on purpose
    let subject, text, html;
    
    switch (purpose) {
      case 'account':
        subject = 'GEM-SPACE Account Verification';
        text = `Your verification code is: ${verificationCode}\nPlease enter this code to verify your account.`;
        html = getAccountVerificationTemplate(verificationCode);
        break;
      case 'password-reset':
        subject = 'GEM-SPACE Password Reset';
        text = `Your password reset code is: ${verificationCode}\nPlease enter this code to reset your password.`;
        html = getPasswordResetTemplate(verificationCode);
        break;
      case 'login':
        subject = 'GEM-SPACE Login Verification';
        text = `Your login verification code is: ${verificationCode}\nPlease enter this code to complete your login.`;
        html = getLoginVerificationTemplate(verificationCode);
        break;
      default:
        subject = 'GEM-SPACE Verification Code';
        text = `Your verification code is: ${verificationCode}`;
        html = getDefaultVerificationTemplate(verificationCode);
    }
    
    // Send email
    const sent = await sendEmail({
      to: email,
      subject,
      text,
      html
    });
    
    if (sent) {
      console.log(`${purpose} code sent successfully to ${email}`);
      return { 
        success: true,
        verificationCode // This will be saved in the database, not sent to client
      };
    } else {
      console.error(`Failed to send ${purpose} code`);
      return { 
        success: false, 
        error: 'Email could not be sent' 
      };
    }
  } catch (error) {
    console.error(`Error sending ${purpose} code:`, error);
    return { 
      success: false, 
      error: error.message 
    };
  }
};

// Email templates
function getAccountVerificationTemplate(code) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #4CAF50; padding: 20px; text-align: center; color: white;">
        <h1>Welcome to GEM-SPACE</h1>
      </div>
      <div style="padding: 20px; background-color: #f9f9f9; border: 1px solid #ddd;">
        <h2>Account Verification</h2>
        <p>Thank you for creating an account. Please verify your email address by entering the code below:</p>
        <div style="background-color: #eee; padding: 15px; text-align: center; font-size: 24px; letter-spacing: 5px; margin: 20px 0; font-weight: bold;">
          ${code}
        </div>
        <p>This code will expire in 15 minutes.</p>
        <p>If you didn't create an account with us, you can safely ignore this email.</p>
      </div>
      <div style="padding: 10px; text-align: center; font-size: 12px; color: #666;">
        &copy; ${new Date().getFullYear()} GEM-SPACE. All rights reserved.
      </div>
    </div>
  `;
}

function getPasswordResetTemplate(code) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #2196F3; padding: 20px; text-align: center; color: white;">
        <h1>GEM-SPACE Password Reset</h1>
      </div>
      <div style="padding: 20px; background-color: #f9f9f9; border: 1px solid #ddd;">
        <h2>Reset Your Password</h2>
        <p>We received a request to reset your password. Enter the code below to proceed:</p>
        <div style="background-color: #eee; padding: 15px; text-align: center; font-size: 24px; letter-spacing: 5px; margin: 20px 0; font-weight: bold;">
          ${code}
        </div>
        <p>This code will expire in 1 hour.</p>
        <p>If you didn't request a password reset, you can safely ignore this email.</p>
      </div>
      <div style="padding: 10px; text-align: center; font-size: 12px; color: #666;">
        &copy; ${new Date().getFullYear()} GEM-SPACE. All rights reserved.
      </div>
    </div>
  `;
}

function getLoginVerificationTemplate(code) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #FF9800; padding: 20px; text-align: center; color: white;">
        <h1>GEM-SPACE Login Verification</h1>
      </div>
      <div style="padding: 20px; background-color: #f9f9f9; border: 1px solid #ddd;">
        <h2>Complete Your Login</h2>
        <p>To secure your account, we need to verify your identity. Enter the code below to complete your login:</p>
        <div style="background-color: #eee; padding: 15px; text-align: center; font-size: 24px; letter-spacing: 5px; margin: 20px 0; font-weight: bold;">
          ${code}
        </div>
        <p>This code will expire in 15 minutes.</p>
        <p>If you didn't attempt to log in, please secure your account by changing your password immediately.</p>
      </div>
      <div style="padding: 10px; text-align: center; font-size: 12px; color: #666;">
        &copy; ${new Date().getFullYear()} GEM-SPACE. All rights reserved.
      </div>
    </div>
  `;
}

function getDefaultVerificationTemplate(code) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #607D8B; padding: 20px; text-align: center; color: white;">
        <h1>GEM-SPACE Verification</h1>
      </div>
      <div style="padding: 20px; background-color: #f9f9f9; border: 1px solid #ddd;">
        <h2>Your Verification Code</h2>
        <p>You requested a verification code. Please enter it to proceed:</p>
        <div style="background-color: #eee; padding: 15px; text-align: center; font-size: 24px; letter-spacing: 5px; margin: 20px 0; font-weight: bold;">
          ${code}
        </div>
        <p>This code will expire in 15 minutes.</p>
        <p>If you didn't request this code, you can safely ignore this email.</p>
      </div>
      <div style="padding: 10px; text-align: center; font-size: 12px; color: #666;">
        &copy; ${new Date().getFullYear()} GEM-SPACE. All rights reserved.
      </div>
    </div>
  `;
}

module.exports = {
  sendPasswordResetEmail: exports.sendPasswordResetEmail,
  sendWelcomeEmail: exports.sendWelcomeEmail,
  sendVerificationCode: exports.sendVerificationCode
};

