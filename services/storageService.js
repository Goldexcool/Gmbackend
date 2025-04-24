const { bucket } = require('../config/firebase');

// Upload file to Firebase Storage
exports.uploadFile = async (file) => {
  try {
    if (!file) {
      throw new Error('No file provided');
    }

    const fileName = `${Date.now()}_${file.originalname}`;
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
        await fileUpload.makePublic();
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
    const fileName = fileUrl.split('/').pop();
    const file = bucket.file(fileName);
    
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