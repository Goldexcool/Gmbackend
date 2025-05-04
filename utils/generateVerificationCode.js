/**
 * Generate a numeric verification code
 * @param {number} length - Length of the code (default: 6)
 * @returns {string} - The generated verification code
 */
const generateVerificationCode = (length = 6) => {
  // Generate a random number with specified length
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return Math.floor(min + Math.random() * (max - min + 1)).toString();
};

module.exports = generateVerificationCode;