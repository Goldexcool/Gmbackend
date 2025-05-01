const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure directories exist
const ensureDirectoryExists = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Setup storage for different types of uploads
const createStorage = (destination) => {
  ensureDirectoryExists(path.join(__dirname, '..', 'public', destination));
  
  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(__dirname, '..', 'public', destination));
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, uniqueSuffix + ext);
    }
  });
};

// File filter for images
const imageFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

// File filter for documents and media
const fileFilter = (req, file, cb) => {
  // List of allowed mime types
  const allowedMimes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/mpeg', 'video/quicktime',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed!'), false);
  }
};

// Create upload instances
const profileUpload = multer({
  storage: createStorage('uploads/profiles'),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: imageFilter
});

const groupAvatarUpload = multer({
  storage: createStorage('uploads/groups'),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: imageFilter
});

const messageAttachmentUpload = multer({
  storage: createStorage('uploads/messages'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: fileFilter
});

const assignmentUpload = multer({
  storage: createStorage('uploads/assignments'),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: fileFilter
});

const courseResourceUpload = multer({
  storage: createStorage('uploads/resources'),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: fileFilter
});

const courseRepChatUpload = multer({
  storage: createStorage('uploads/course-rep-chat'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: fileFilter
});

const resourceUpload = multer({
  storage: createStorage('uploads/resources'),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit for educational resources
  fileFilter: (req, file, cb) => {
    // Allow documents, images, videos, and other common educational file types
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'image/jpeg',
      'image/png',
      'image/gif',
      'video/mp4',
      'audio/mpeg',
      'application/zip',
      'application/x-zip-compressed',
      'application/octet-stream'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed. Please upload a document, image, video, or audio file.'), false);
    }
  }
});

// Export functions - fixed names to be consistent
module.exports = {
  // Single file uploads
  single: (fieldName) => profileUpload.single(fieldName),
  uploadSingle: (fieldName) => profileUpload.single(fieldName), // Add alias for backward compatibility
  
  // Group avatar uploads
  groupAvatar: (fieldName) => groupAvatarUpload.single(fieldName),
  
  // Multiple file uploads
  uploadMultiple: (fieldName, maxCount) => messageAttachmentUpload.array(fieldName, maxCount),
  
  // Specific uploads
  assignmentFiles: (fieldName, maxCount) => assignmentUpload.array(fieldName, maxCount),
  resourceFile: (fieldName) => courseResourceUpload.single(fieldName),
  courseRepChatFile: (fieldName, maxCount) => courseRepChatUpload.array(fieldName, maxCount),
  uploadFile: (fieldName, maxSize = 10) => resourceUpload.single(fieldName)
};