const nodemailer = require('nodemailer');

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

const sendPasswordResetEmail = async (email, resetToken) => {
  try {
    const transporter = getTransporter();
    const resetUrl = `${process.env.FRONTEND_URL}/${resetToken}`;
    
    const emailContent = `
      <h2 style="${STYLES.sectionTitle}">Reset Your Password</h2>
      <p style="${STYLES.paragraph}">We received a request to reset your password. To proceed with this request, please use the token below or click the button.</p>
      
      <!-- Security notice with icon -->
      <div style="display: flex; background-color: #fff8e1; padding: 15px; border-radius: 8px; margin-bottom: 25px; align-items: center;">
        <div style="margin-right: 15px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${TEAL_COLOR}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
        </div>
        <div>
          <p style="margin: 0; color: #b0632d; font-size: 14px;">For security reasons, this reset link will expire in 60 minutes.</p>
        </div>
      </div>
      
      <!-- Token design -->
      <div style="${STYLES.token}">${resetToken}</div>
      
      <!-- CTA button -->
      <div style="text-align: center;">
        <a href="${resetUrl}" style="${STYLES.button}">Reset Password</a>
      </div>
      
      <div style="${STYLES.divider}"></div>
      
      <p style="${STYLES.paragraph}">If you didn't request a password reset, please ignore this email or contact support if you have concerns about your account security.</p>
    `;
    
    const mailOptions = {
      from: {
        name: 'GemSpace Security',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: 'Reset Your GemSpace Password',
      html: emailBase(emailContent),
      // Text version for better deliverability
      text: `Reset Your GemSpace Password\n\nWe received a request to reset your password. Your token is: ${resetToken}\n\nTo reset your password, visit: ${resetUrl}\n\nThis token will expire in 60 minutes.\n\nIf you didn't request this reset, please ignore this email.`
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return { success: false, error: error.message };
  }
};

const sendWelcomeEmail = async (email, fullName) => {
  try {
    console.log(`Sending welcome email to: ${email} (${fullName})`);
    const transporter = getTransporter();
    
    const appUrl = process.env.FRONTEND_URL || '#';
    
    const emailContent = `
      <h2 style="${STYLES.sectionTitle}">Welcome to GemSpace!</h2>
      <p style="${STYLES.paragraph}">Hello ${fullName || 'there'},</p>
      <p style="${STYLES.paragraph}">We're thrilled to welcome you to GemSpace, your new educational hub for connecting, learning, and growing together.</p>
      
      <div style="${STYLES.divider}"></div>
      
      <h3 style="${STYLES.sectionTitle}">Discover What's Possible</h3>
      
      <!-- Feature cards with icons -->
      <div style="${STYLES.featureCard}">
        <div style="display: flex; align-items: center;">
          <div style="margin-right: 20px; background-color: rgba(0,128,128,0.1); border-radius: 50%; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${TEAL_COLOR}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <div>
            <h4 style="margin: 0 0 5px 0; color: ${TEAL_DARK};">Connect with Peers</h4>
            <p style="margin: 0; color: ${TEXT_MEDIUM};">Build your network with like-minded learners and collaborate on projects.</p>
          </div>
        </div>
      </div>
      
      <div style="${STYLES.featureCard}">
        <div style="display: flex; align-items: center;">
          <div style="margin-right: 20px; background-color: rgba(0,128,128,0.1); border-radius: 50%; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${TEAL_COLOR}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
            </svg>
          </div>
          <div>
            <h4 style="margin: 0 0 5px 0; color: ${TEAL_DARK};">Access Resources</h4>
            <p style="margin: 0; color: ${TEXT_MEDIUM};">Explore our extensive library of educational materials and expert guidance.</p>
          </div>
        </div>
      </div>
      
      <div style="${STYLES.featureCard}">
        <div style="display: flex; align-items: center;">
          <div style="margin-right: 20px; background-color: rgba(0,128,128,0.1); border-radius: 50%; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${TEAL_COLOR}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <div>
            <h4 style="margin: 0 0 5px 0; color: ${TEAL_DARK};">Track Progress</h4>
            <p style="margin: 0; color: ${TEXT_MEDIUM};">Monitor your learning journey with detailed insights and analytics.</p>
          </div>
        </div>
      </div>
      
      <div style="${STYLES.divider}"></div>
      
      <!-- CTA button -->
      <div style="text-align: center;">
        <p style="${STYLES.paragraph}">Ready to begin your learning adventure?</p>
        <a href="${appUrl}" style="${STYLES.button}">Get Started Now</a>
      </div>
      
      <p style="${STYLES.paragraph}">If you have any questions, our support team is always ready to help you succeed.</p>
      <p style="${STYLES.paragraph}">Happy learning!<br>The GemSpace Team</p>
    `;
    
    const mailOptions = {
      from: {
        name: 'GemSpace Team',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: 'Welcome to GemSpace! Your Learning Journey Begins',
      html: emailBase(emailContent),
      // Text version for better deliverability
      text: `Welcome to GemSpace!\n\nHello ${fullName || 'there'},\n\nWe're thrilled to welcome you to GemSpace, your new educational hub for connecting, learning, and growing together.\n\nWith GemSpace, you can:\n- Connect with other learners\n- Access educational resources\n- Track your learning progress\n- Join live learning sessions\n\nGet started now: ${appUrl}\n\nHappy learning!\nThe GemSpace Team`
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('Welcome email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendPasswordResetEmail,
  sendWelcomeEmail
};