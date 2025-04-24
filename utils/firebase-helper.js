// utils/firebase-helper.js
const { bucket } = require('../src/config/firebase');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Upload file to Firebase Storage
exports.uploadToFirebase = async (file) => {
  try {
    if (!file) {
      throw new Error('No file provided');
    }

    const fileName = `${uuidv4()}${path.extname(file.originalname)}`;
    const fileUpload = bucket.file(fileName);

    const blobStream = fileUpload.createWriteStream({
      metadata: {
        contentType: file.mimetype,
      },
    });

    return new Promise((resolve, reject) => {
      blobStream.on('error', (error) => {
        reject(error);
      });

      blobStream.on('finish', async () => {
        // Make the file public
        await fileUpload.makePublic();
        
        // Get the public URL
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        resolve(publicUrl);
      });

      blobStream.end(file.buffer);
    });
  } catch (error) {
    console.error('Error uploading file to Firebase:', error);
    throw error;
  }
};

// Generate a signed URL for file download
exports.getDownloadUrl = async (fileUrl) => {
  try {
    // Extract filename from URL
    const fileName = fileUrl.split('/').pop();
    const file = bucket.file(fileName);
    
    // Generate signed URL that expires in 1 hour
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });
    
    return url;
  } catch (error) {
    console.error('Error generating download URL:', error);
    return fileUrl; // Return original URL as fallback
  }
};