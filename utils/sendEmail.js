const nodemailer = require('nodemailer');

/**
 * Send an email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text content
 * @param {string} options.html - HTML content
 * @returns {Promise<boolean>} - Success status
 */
const sendEmail = async (options) => {
  try {
    console.log('Attempting to send email to:', options.to);
    
    // Check for email credentials
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.error('Email credentials missing in .env file');
      return false;
    }

    // Create transporter with specific Gmail configuration
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true, // Use SSL
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      },
      // Optional debug settings
      debug: process.env.NODE_ENV === 'development',
      logger: process.env.NODE_ENV === 'development'
    });
    
    console.log('Email configuration:');
    console.log('- Host: smtp.gmail.com');
    console.log('- Port: 465');
    console.log('- Secure: true');
    console.log('- User email length:', process.env.EMAIL_USER.length);
    console.log('- Password length:', process.env.EMAIL_PASSWORD.length);

    // Mail options
    const mailOptions = {
      from: `"GemSpace" <${process.env.EMAIL_USER}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return true;
  } catch (error) {
    console.error('EMAIL SENDING ERROR:');
    console.error('- Error name:', error.name);
    console.error('- Error code:', error.code);
    console.error('- Error message:', error.message);
    
    if (error.code === 'EAUTH') {
      console.error('Authentication failed. Please check your email and app password.');
    }
    
    return false;
  }
};

module.exports = sendEmail;