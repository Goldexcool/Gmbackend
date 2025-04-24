const Resource = require('../models/Resource');
const User = require('../models/User');
const path = require('path');
const fs = require('fs');
const { bucket } = require('../config/firebase');


exports.uploadResource = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please upload a file' 
      });
    }

    const { title, description, category, courseId, visibility = 'public' } = req.body;

    // Validate required fields
    if (!title || !category) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title and category'
      });
    }

    let fileUrl = '';
    let fileName = '';

    // If Firebase is available, upload to Firebase Storage
    if (bucket && bucket.file) {
      // Generate unique filename
      fileName = `${Date.now()}-${req.file.originalname.replace(/\s+/g, '-')}`;
      const filePath = req.file.path;
      
      // Upload to Firebase
      try {
        const blob = bucket.file(fileName);
        const blobStream = blob.createWriteStream({
          metadata: {
            contentType: req.file.mimetype
          }
        });

        blobStream.on('error', (error) => {
          console.error('Firebase upload error:', error);
          return res.status(500).json({
            success: false,
            message: 'Error uploading file to storage'
          });
        });

        blobStream.on('finish', async () => {
          // Make the file public
          try {
            await blob.makePublic();
            fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
            
            // Create resource entry in database
            const resource = await Resource.create({
              title,
              description,
              category,
              courseId,
              fileUrl,
              fileName,
              fileType: req.file.mimetype,
              fileSize: req.file.size,
              visibility,
              uploadedBy: req.user.id
            });

            // Delete the temp file
            fs.unlinkSync(filePath);

            return res.status(201).json({
              success: true,
              data: resource
            });
          } catch (error) {
            console.error('Error making file public:', error);
            return res.status(500).json({
              success: false,
              message: 'Error making file public'
            });
          }
        });

        // Read the file and pipe it to the blob stream
        fs.createReadStream(filePath).pipe(blobStream);
        return;
      } catch (error) {
        console.error('Firebase error, falling back to local storage:', error);
      }
    }

    const uploadDir = path.join(__dirname, '../uploads');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    fileName = `${Date.now()}-${req.file.originalname.replace(/\s+/g, '-')}`;
    const targetPath = path.join(uploadDir, fileName);
    
    // Move the file to the uploads directory
    fs.copyFileSync(req.file.path, targetPath);
    fs.unlinkSync(req.file.path); // Delete the temp file
    
    // Create a relative URL
    fileUrl = `/uploads/${fileName}`;
    
    // Create resource entry in database
    const resource = await Resource.create({
      title,
      description,
      category,
      courseId,
      fileUrl,
      fileName,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      visibility,
      uploadedBy: req.user.id
    });

    res.status(201).json({
      success: true,
      data: resource
    });
  } catch (error) {
    console.error('Resource upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.getAllResources = async (req, res) => {
  try {
    const { 
      category, 
      courseId, 
      uploadedBy, 
      sort = 'newest', 
      limit = 10, 
      page = 1 
    } = req.query;

    // Build query object
    let query = {};
    
    // Filter by category if provided
    if (category) {
      query.category = category;
    }
    
    // Filter by course if provided
    if (courseId) {
      query.courseId = courseId;
    }
    
    // Filter by uploader if provided
    if (uploadedBy) {
      query.uploadedBy = uploadedBy;
    }
    

    if (req.user.role !== 'admin') {
      query.$or = [
        { visibility: 'public' },
        { uploadedBy: req.user.id }
      ];
    }
    
    // Set up pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Set up sorting
    let sortOption = {};
    switch (sort) {
      case 'newest':
        sortOption = { createdAt: -1 };
        break;
      case 'oldest':
        sortOption = { createdAt: 1 };
        break;
      case 'title_asc':
        sortOption = { title: 1 };
        break;
      case 'title_desc':
        sortOption = { title: -1 };
        break;
      default:
        sortOption = { createdAt: -1 };
    }
    
    // Get resources with pagination
    const resources = await Resource.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('uploadedBy', 'fullName avatar role');
      
    // Get total count for pagination
    const total = await Resource.countDocuments(query);
    
    res.status(200).json({
      success: true,
      count: resources.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: resources
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.getResourcesByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { limit = 10, page = 1 } = req.query;
    
    // Build query object
    let query = { category };
    
    // Handle resource visibility
    if (req.user.role !== 'admin') {
      query.$or = [
        { visibility: 'public' },
        { uploadedBy: req.user.id }
      ];
    }
    
    // Set up pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get resources with pagination
    const resources = await Resource.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('uploadedBy', 'fullName avatar role');
      
    // Get total count for pagination
    const total = await Resource.countDocuments(query);
    
    res.status(200).json({
      success: true,
      count: resources.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: resources
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get specific resource
// @route   GET /api/resources/:id
// @access  Private
exports.getResourceById = async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id)
      .populate('uploadedBy', 'fullName avatar role');
      
    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found'
      });
    }
    
    // Check if user has access (admin, uploader, or public resource)
    const hasAccess = 
      req.user.role === 'admin' || 
      resource.uploadedBy.toString() === req.user.id ||
      resource.visibility === 'public';
      
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this resource'
      });
    }
    
    // Increment views count
    resource.views += 1;
    await resource.save();
    
    res.status(200).json({
      success: true,
      data: resource
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Update resource details
// @route   PUT /api/resources/:id
// @access  Private
exports.updateResource = async (req, res) => {
  try {
    let resource = await Resource.findById(req.params.id);
    
    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found'
      });
    }
    
    // Check ownership or admin status
    if (resource.uploadedBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this resource'
      });
    }
    
    // Update fields
    const { title, description, category, visibility } = req.body;
    
    if (title) resource.title = title;
    if (description) resource.description = description;
    if (category) resource.category = category;
    if (visibility) resource.visibility = visibility;
    
    resource.lastUpdated = Date.now();
    
    await resource.save();
    
    res.status(200).json({
      success: true,
      data: resource
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Delete resource
// @route   DELETE /api/resources/:id
// @access  Private
exports.deleteResource = async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);
    
    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found'
      });
    }
    
    // Check ownership or admin status
    if (resource.uploadedBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this resource'
      });
    }
    
    // Delete from storage based on storage method
    if (resource.fileUrl.includes('storage.googleapis.com') && bucket && bucket.file) {
      // Delete from Firebase Storage
      try {
        await bucket.file(resource.fileName).delete();
      } catch (error) {
        console.error('Error deleting from Firebase:', error);
      }
    } else {
      // Delete from local storage
      const filePath = path.join(__dirname, '..', resource.fileUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    // Delete from database
    await resource.remove();
    
    res.status(200).json({
      success: true,
      message: 'Resource deleted successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Search resources
// @route   GET /api/resources/search
// @access  Private
exports.searchResources = async (req, res) => {
  try {
    const { query, limit = 10, page = 1 } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Please provide search query'
      });
    }
    
    // Build search object
    let searchQuery = {
      $or: [
        { title: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } }
      ]
    };
    
    // Handle resource visibility
    if (req.user.role !== 'admin') {
      searchQuery.$and = [
        {
          $or: [
            { visibility: 'public' },
            { uploadedBy: req.user.id }
          ]
        }
      ];
    }
    
    // Set up pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get resources with pagination
    const resources = await Resource.find(searchQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('uploadedBy', 'fullName avatar role');
      
    // Get total count for pagination
    const total = await Resource.countDocuments(searchQuery);
    
    res.status(200).json({
      success: true,
      count: resources.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: resources
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Download resource
// @route   GET /api/resources/:id/download
// @access  Private
exports.downloadResource = async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);
    
    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found'
      });
    }
    
    // Check if user has access (admin, uploader, or public resource)
    const hasAccess = 
      req.user.role === 'admin' || 
      resource.uploadedBy.toString() === req.user.id ||
      resource.visibility === 'public';
      
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to download this resource'
      });
    }
    
    // Increment downloads count
    resource.downloads += 1;
    await resource.save();
    
    // Handle Firebase vs local storage
    if (resource.fileUrl.includes('storage.googleapis.com') && bucket && bucket.file) {
      // Generate signed URL for Firebase Storage
      try {
        const [url] = await bucket.file(resource.fileName).getSignedUrl({
          action: 'read',
          expires: Date.now() + 15 * 60 * 1000 // 15 minutes
        });
        
        return res.status(200).json({
          success: true,
          url
        });
      } catch (error) {
        console.error('Error generating signed URL:', error);
        return res.status(500).json({
          success: false,
          message: 'Error generating download URL'
        });
      }
    } else {
      // Local storage - direct download
      const filePath = path.join(__dirname, '..', resource.fileUrl);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          message: 'File not found on server'
        });
      }
      
      res.download(filePath, resource.fileName);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};