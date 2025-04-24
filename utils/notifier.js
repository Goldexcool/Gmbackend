// utils/notifier.js
const nodemailer = require('nodemailer');

// Create reusable transporter based on configuration
let transporter;

if (process.env.NODE_ENV === 'test' || !process.env.EMAIL_SERVICE) {
  // Create a test account for development/testing
  console.log('Using test email configuration');
  transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: 'ethereal-test@example.com',
      pass: 'password',
    },
  });
} else if (process.env.EMAIL_HOST && process.env.EMAIL_PORT) {
  // Custom SMTP configuration
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT),
    secure: process.env.EMAIL_PORT === '465',
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
} else {
  transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE,
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
}

// Send email
exports.sendEmail = async (options) => {
  try {
    const message = {
      from: `GEM-SPACE <${process.env.EMAIL_FROM || process.env.EMAIL_USERNAME}>`,
      to: options.email,
      subject: options.subject,
      text: options.message,
      html: options.html,
    };

    const info = await transporter.sendMail(message);
    console.log(`Email sent to ${options.email}`);
    
    if (process.env.NODE_ENV !== 'production' && info.messageId) {
      console.log(`Email preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    }
    
    return true;
  } catch (error) {
    console.error('Email sending error:', error);
    return false;
  }
};

exports.sendNotification = async (email, subject, message) => {
  return await exports.sendEmail({
    email,
    subject,
    message,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #4f46e5; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">GEM-SPACE</h1>
        </div>
        <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
          <h2 style="color: #111827;">${subject}</h2>
          <p style="color: #4b5563;">${message}</p>
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 0.875rem;">
            This is an automated message from GEM-SPACE. Please do not reply to this email.
          </div>
        </div>
      </div>
    `
  });
};