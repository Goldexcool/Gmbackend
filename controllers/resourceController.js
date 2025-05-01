const Resource = require('../models/Resource');
const User = require('../models/User');
const CourseResource = require('../models/CourseResource');
const Lecturer = require('../models/Lecturer');
const Course = require('../models/Course');
const AcademicSession = require('../models/AcademicSession');
const path = require('path');
const fs = require('fs');
const { bucket } = require('../config/firebase');
const externalResourceService = require('../services/externalResourceService');
const SavedResource = require('../models/SavedResource');
const ResourceDownload = require('../models/ResourceDownload');

/**
 * @desc    Upload a resource (for lecturers)
 * @route   POST /api/resources/library
 * @access  Private/Lecturer
 */
exports.uploadResource = async (req, res) => {
  try {
    // Verify that the user is a lecturer (additional check)
    if (req.user.role !== 'lecturer') {
      return res.status(403).json({
        success: false,
        message: 'Only lecturers can upload resources directly'
      });
    }

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
            
            // Automatically approve resources uploaded by lecturers
            const resource = new Resource({
              title,
              description,
              category,
              course: courseId,
              visibility,
              fileUrl,
              fileName: req.file.originalname,
              fileType: req.file.mimetype,
              fileSize: req.file.size,
              uploadedBy: req.user.id,
              isApproved: true, // Auto-approve for lecturers
              approvedBy: req.user.id
            });

            await resource.save();

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
    
    // Automatically approve resources uploaded by lecturers
    const resource = new Resource({
      title,
      description,
      category,
      course: courseId,
      visibility,
      fileUrl,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      uploadedBy: req.user.id,
      isApproved: true, // Auto-approve for lecturers
      approvedBy: req.user.id
    });

    await resource.save();

    res.status(201).json({
      success: true,
      data: resource
    });
  } catch (error) {
    console.error('Error uploading resource:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * @desc    Upload a resource (for students)
 * @route   POST /api/resources/student-upload
 * @access  Private/Student
 */
exports.studentUploadResource = async (req, res) => {
  try {
    // Verify that the user is a student (additional check)
    if (req.user.role !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'This upload route is for students only'
      });
    }

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

    // File upload logic - adjust based on your actual implementation
    let fileUrl;
    if (process.env.STORAGE_TYPE === 'firebase') {
      // Firebase upload logic
      const file = req.file;
      const filename = `resources/${Date.now()}-${file.originalname}`;
      const fileUpload = bucket.file(filename);
      
      const blobStream = fileUpload.createWriteStream({
        metadata: {
          contentType: file.mimetype
        }
      });
      
      blobStream.on('error', (error) => {
        throw new Error(error);
      });
      
      blobStream.on('finish', async () => {
        // Get signed URL
        fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileUpload.name}`;
      });
      
      blobStream.end(file.buffer);
    } else {
      // Local storage logic
      fileUrl = `/uploads/resources/${req.file.filename}`;
    }

    // Create new resource
    const resource = new Resource({
      title,
      description,
      category,
      course: courseId,
      visibility,
      fileUrl: fileUrl,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      uploadedBy: req.user.id,
      isApproved: false,  // Student uploads require approval
      pendingApproval: true
    });

    await resource.save();

    res.status(201).json({
      success: true,
      message: 'Resource uploaded successfully and is pending approval',
      data: resource
    });
  } catch (error) {
    console.error('Error uploading resource:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * @desc    Get resources for students and lecturers
 * @route   GET /api/resources/library/search
 * @access  Private/Student,Lecturer
 */
exports.searchResources = async (req, res) => {
  try {
    const { query, type, sources = 'local,googleBooks,openLibrary', limit = 10, page = 1 } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a search query'
      });
    }
    
    // Build local search query
    const searchQuery = {
      $or: [
        { title: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } }
      ]
    };
    
    if (type) {
      searchQuery.type = type;
    }
    
    // Only include users with roles student or lecturer
    if (req.user.role !== 'student' && req.user.role !== 'lecturer') {
      return res.status(403).json({
        success: false,
        message: 'Only students and lecturers can access resources'
      });
    }
    
    // For local resources
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get resources from database
    const resources = await Resource.find(searchQuery)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });
    
    const totalResources = await Resource.countDocuments(searchQuery);
    
    // Get external resources if requested
    let externalResults = {};
    if (sources && sources !== 'local') {
      const sourcesArray = sources.split(',').filter(s => s !== 'local');
      
      if (sourcesArray.length > 0) {
        const externalData = await externalResourceService.searchAllSources(query, {
          maxResults: parseInt(limit),
          sources: sourcesArray
        });
        
        externalResults = externalData.external;
      }
    }
    
    res.status(200).json({
      success: true,
      count: resources.length,
      totalPages: Math.ceil(totalResources / parseInt(limit)),
      currentPage: parseInt(page),
      data: {
        local: resources,
        external: externalResults
      }
    });
  } catch (error) {
    console.error('Error searching resources:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching resources',
      error: error.message
    });
  }
};

/**
 * @desc    Download a resource
 * @route   GET /api/resources/library/:id/download
 * @access  Private/Student,Lecturer
 */
exports.downloadResource = async (req, res) => {
  try {
    // Verify user is either student or lecturer
    if (req.user.role !== 'student' && req.user.role !== 'lecturer') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only students and lecturers can download resources.'
      });
    }

    const { id } = req.params;
    
    const resource = await Resource.findByIdAndUpdate(
      id,
      { $inc: { downloads: 1 } }
    );
    
    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found'
      });
    }
    
    // Only allow downloading approved resources unless it's the uploader
    if (!resource.isApproved && resource.uploadedBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'This resource is pending approval and cannot be downloaded yet'
      });
    }
    
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
    console.error('Error downloading resource:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * @desc    Get lecturer dashboard resource stats
 * @route   GET /api/resources/library/lecturer-stats
 * @access  Private/Lecturer
 */
exports.getLecturerResourceStats = async (req, res) => {
  try {
    // Verify lecturer role
    if (req.user.role !== 'lecturer') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only lecturers can access these stats.'
      });
    }

    // Get all resources uploaded by this lecturer
    const totalUploaded = await Resource.countDocuments({ uploadedBy: req.user.id });
    
    // Get download stats for lecturer's resources
    const resources = await Resource.find({ uploadedBy: req.user.id })
      .select('title downloads views');
    
    // Get total downloads for all lecturer resources
    const totalDownloads = resources.reduce((total, resource) => total + resource.downloads, 0);
    
    // Get resources pending approval from students
    const pendingApproval = await Resource.countDocuments({ 
      pendingApproval: true,
      course: { $in: req.lecturerCourses } // Assuming you have middleware that sets this
    });
    
    res.status(200).json({
      success: true,
      data: {
        totalUploaded,
        totalDownloads,
        pendingApproval,
        resources
      }
    });
  } catch (error) {
    console.error('Error getting lecturer stats:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * @desc    Get student resource stats
 * @route   GET /api/resources/library/student-stats
 * @access  Private/Student
 */
exports.getStudentResourceStats = async (req, res) => {
  try {
    // Verify student role
    if (req.user.role !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only students can access these stats.'
      });
    }

    // Get all resources uploaded by this student
    const uploads = await Resource.find({ uploadedBy: req.user.id })
      .select('title isApproved pendingApproval downloads createdAt');
    
    // Get resources saved/bookmarked by the student
    // Assuming you have a saved resources collection
    const savedResources = await SavedResource.find({ user: req.user.id })
      .populate('resource', 'title');
    
    // Get download history
    // Assuming you track downloads
    const downloadHistory = await ResourceDownload.find({ user: req.user.id })
      .populate('resource', 'title')
      .sort({ downloadDate: -1 })
      .limit(10);
    
    res.status(200).json({
      success: true,
      data: {
        uploads,
        saved: savedResources,
        recentDownloads: downloadHistory
      }
    });
  } catch (error) {
    console.error('Error getting student stats:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * @desc    Save a resource for later access
 * @route   POST /api/resources/:id/save
 * @access  Private (Student/Lecturer)
 */
exports.saveResource = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes, folder, tags } = req.body;
    
    // Check if resource exists
    const resource = await Resource.findById(id);
    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found'
      });
    }
    
    // Check if already saved
    const existingSave = await SavedResource.findOne({
      user: req.user.id,
      resource: id
    });
    
    if (existingSave) {
      // Update existing saved resource
      existingSave.notes = notes || existingSave.notes;
      existingSave.folder = folder || existingSave.folder;
      existingSave.tags = tags || existingSave.tags;
      
      await existingSave.save();
      
      return res.status(200).json({
        success: true,
        message: 'Resource updated in saved items',
        data: existingSave
      });
    }
    
    // Create new saved resource
    const savedResource = await SavedResource.create({
      user: req.user.id,
      resource: id,
      notes: notes || '',
      folder: folder || 'General',
      tags: tags || []
    });
    
    res.status(201).json({
      success: true,
      message: 'Resource saved successfully',
      data: savedResource
    });
  } catch (error) {
    console.error('Error saving resource:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * @desc    Rate a resource
 * @route   POST /api/resources/:id/rate
 * @access  Private (Student/Lecturer)
 */
exports.rateResource = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, review } = req.body;
    
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }
    
    // Check if resource exists
    const resource = await Resource.findById(id);
    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found'
      });
    }
    
    // Check if user already rated this resource
    const ratingIndex = resource.ratings.findIndex(r => 
      r.user && r.user.toString() === req.user.id
    );
    
    if (ratingIndex > -1) {
      // Update existing rating
      resource.ratings[ratingIndex].rating = rating;
      if (review) {
        resource.ratings[ratingIndex].review = review;
      }
      resource.ratings[ratingIndex].updatedAt = Date.now();
    } else {
      // Add new rating
      resource.ratings.push({
        user: req.user.id,
        rating,
        review: review || '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }
    
    // Calculate average rating
    const totalRating = resource.ratings.reduce((sum, item) => sum + item.rating, 0);
    resource.averageRating = (totalRating / resource.ratings.length).toFixed(1);
    
    await resource.save();
    
    res.status(200).json({
      success: true,
      message: 'Resource rated successfully',
      data: {
        averageRating: resource.averageRating,
        ratingsCount: resource.ratings.length,
        userRating: rating
      }
    });
  } catch (error) {
    console.error('Error rating resource:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * @desc    Share a resource with others
 * @route   POST /api/resources/:id/share
 * @access  Private (Student/Lecturer)
 */
exports.shareResource = async (req, res) => {
  try {
    const { id } = req.params;
    const { recipients, message, groupId } = req.body;
    
    // Check if resource exists
    const resource = await Resource.findById(id);
    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found'
      });
    }
    
    // Increment share count
    resource.shares = (resource.shares || 0) + 1;
    await resource.save();
    
    // Implement sharing functionality based on your app structure
    // This could be:
    // 1. Sharing to group chat
    // 2. Sharing to individual users
    
    if (groupId) {
      // Share to group chat logic here
      // Implement this based on your group chat model
    }
    
    if (recipients && recipients.length > 0) {
      // Share to individual users logic here
      // Implement this based on your messaging model
    }
    
    res.status(200).json({
      success: true,
      message: 'Resource shared successfully'
    });
  } catch (error) {
    console.error('Error sharing resource:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * @desc    Get resource details
 * @route   GET /api/resources/:id
 * @access  Private (Student/Lecturer)
 */
exports.getResourceDetail = async (req, res) => {
  try {
    const { id } = req.params;
    
    const resource = await Resource.findById(id)
      .populate('uploadedBy', 'fullName avatar role')
      .populate('course', 'code title');
    
    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found'
      });
    }
    
    // Increment view count
    resource.views = (resource.views || 0) + 1;
    await resource.save();
    
    // Check if user has saved this resource
    const isSaved = await SavedResource.exists({
      user: req.user.id,
      resource: id
    });
    
    // Get user's rating if any
    const userRating = resource.ratings.find(
      r => r.user && r.user.toString() === req.user.id
    );
    
    res.status(200).json({
      success: true,
      data: {
        ...resource.toObject(),
        isSaved: !!isSaved,
        userRating: userRating ? userRating.rating : null
      }
    });
  } catch (error) {
    console.error('Error getting resource details:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * @desc    Get all resources uploaded by the lecturer
 * @route   GET /api/lecturer/resources
 * @access  Private/Lecturer
 */
exports.getLecturerResources = async (req, res) => {
  try {
    const { 
      query, 
      courseId, 
      type, 
      sort = 'createdAt', 
      order = 'desc',
      page = 1,
      limit = 10
    } = req.query;

    // Build filter
    const filter = { uploadedBy: req.user.id };

    if (query) {
      filter.$or = [
        { title: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } }
      ];
    }

    if (courseId) {
      filter.course = courseId;
    }

    if (type) {
      filter.category = type;
    }

    // Build sort object
    const sortObj = {};
    sortObj[sort] = order === 'asc' ? 1 : -1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get resources
    const resources = await Resource.find(filter)
      .populate('course', 'code title')
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Resource.countDocuments(filter);

    // Calculate statistics
    const stats = {
      totalResources: total,
      views: resources.reduce((sum, r) => sum + (r.views || 0), 0),
      downloads: resources.reduce((sum, r) => sum + (r.downloads || 0), 0)
    };

    res.status(200).json({
      success: true,
      count: resources.length,
      total,
      pages: Math.ceil(total / parseInt(limit)),
      page: parseInt(page),
      stats,
      data: resources
    });
  } catch (error) {
    console.error('Error getting lecturer resources:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting resources',
      error: error.message
    });
  }
};

/**
 * @desc    Get a single resource uploaded by the lecturer
 * @route   GET /api/lecturer/resources/:id
 * @access  Private/Lecturer
 */
exports.getLecturerResource = async (req, res) => {
  try {
    const { id } = req.params;

    const resource = await Resource.findOne({
      _id: id,
      uploadedBy: req.user.id
    }).populate('course', 'code title department');

    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found or you are not authorized to view it'
      });
    }

    // Get download history (last 10)
    const downloads = await ResourceDownload.find({ resource: id })
      .populate('user', 'fullName avatar role')
      .sort({ downloadDate: -1 })
      .limit(10);

    // Get ratings and reviews
    const ratings = resource.ratings || [];
    const ratingsWithUsers = await Promise.all(
      ratings.map(async (rating) => {
        const user = await User.findById(rating.user).select('fullName avatar role');
        return {
          ...rating.toObject(),
          user
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        ...resource.toObject(),
        ratings: ratingsWithUsers,
        downloadHistory: downloads
      }
    });
  } catch (error) {
    console.error('Error getting lecturer resource:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting resource',
      error: error.message
    });
  }
};

/**
 * @desc    Create a new resource (for lecturers)
 * @route   POST /api/lecturer/resources
 * @access  Private/Lecturer
 */
exports.createResource = async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      courseId,
      visibility = 'public',
      tags
    } = req.body;

    // Validate required fields
    if (!title || !category) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title and category'
      });
    }

    // Check if course exists (if courseId is provided)
    if (courseId) {
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).json({
          success: false,
          message: 'Course not found'
        });
      }
    }

    // Process file uploads
    const files = req.files || [];
    const fileData = [];

    // Handle file uploads based on storage type (local or Firebase)
    if (process.env.STORAGE_TYPE === 'firebase') {
      // Firebase Storage upload logic
      for (const file of files) {
        const filename = `resources/${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
        const fileUpload = bucket.file(filename);
        
        const blobStream = fileUpload.createWriteStream({
          metadata: {
            contentType: file.mimetype
          }
        });
        
        await new Promise((resolve, reject) => {
          blobStream.on('error', (error) => reject(error));
          blobStream.on('finish', async () => {
            // Generate signed URL
            const [url] = await fileUpload.getSignedUrl({
              action: 'read',
              expires: '03-01-2500' // Far future
            });
            
            fileData.push({
              filename: file.originalname,
              fileUrl: url,
              filePath: filename,
              fileType: file.mimetype,
              fileSize: file.size
            });
            
            resolve();
          });
          
          blobStream.end(file.buffer);
        });
      }
    } else {
      // Local storage logic
      for (const file of files) {
        fileData.push({
          filename: file.originalname,
          fileUrl: `/uploads/resources/${file.filename}`,
          filePath: `uploads/resources/${file.filename}`,
          fileType: file.mimetype,
          fileSize: file.size
        });
      }
    }

    // Parse tags
    const parsedTags = tags ? 
      (Array.isArray(tags) ? tags : JSON.parse(tags)) : 
      [];

    // Create new resource
    const resource = await Resource.create({
      title,
      description,
      category,
      course: courseId,
      visibility,
      files: fileData,
      tags: parsedTags,
      uploadedBy: req.user.id,
      isApproved: true, // Auto-approve lecturer resources
      approvedBy: req.user.id,
      approvalDate: Date.now()
    });

    // Return response
    res.status(201).json({
      success: true,
      message: 'Resource created successfully',
      data: resource
    });
  } catch (error) {
    console.error('Error creating resource:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating resource',
      error: error.message
    });
  }
};

/**
 * @desc    Update a resource (for lecturers)
 * @route   PUT /api/lecturer/resources/:id
 * @access  Private/Lecturer
 */
exports.updateResource = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      category,
      courseId,
      visibility,
      tags,
      removeFiles
    } = req.body;

    // Find resource and check ownership
    const resource = await Resource.findOne({
      _id: id,
      uploadedBy: req.user.id
    });

    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found or you are not authorized to update it'
      });
    }

    // Update basic fields if provided
    if (title) resource.title = title;
    if (description) resource.description = description;
    if (category) resource.category = category;
    if (courseId) resource.course = courseId;
    if (visibility) resource.visibility = visibility;
    
    // Update tags if provided
    if (tags) {
      resource.tags = Array.isArray(tags) ? tags : JSON.parse(tags);
    }

    // Handle file removals if specified
    if (removeFiles && removeFiles.length > 0) {
      const filesToRemove = Array.isArray(removeFiles) ? 
        removeFiles : 
        JSON.parse(removeFiles);
      
      // If using Firebase storage, delete files from storage
      if (process.env.STORAGE_TYPE === 'firebase') {
        for (const fileId of filesToRemove) {
          const fileToRemove = resource.files.find(f => f._id.toString() === fileId);
          if (fileToRemove && fileToRemove.filePath) {
            try {
              await bucket.file(fileToRemove.filePath).delete();
            } catch (error) {
              console.warn(`Failed to delete file from storage: ${error.message}`);
            }
          }
        }
      } else {
        // For local storage, delete files from disk
        for (const fileId of filesToRemove) {
          const fileToRemove = resource.files.find(f => f._id.toString() === fileId);
          if (fileToRemove && fileToRemove.filePath) {
            const fullPath = path.join(__dirname, '..', 'public', fileToRemove.filePath);
            if (fs.existsSync(fullPath)) {
              fs.unlinkSync(fullPath);
            }
          }
        }
      }
      
      // Filter out removed files from resource.files
      resource.files = resource.files.filter(
        file => !filesToRemove.includes(file._id.toString())
      );
    }

    // Process new file uploads
    const files = req.files || [];
    
    if (files.length > 0) {
      const newFileData = [];

      // Handle new file uploads based on storage type
      if (process.env.STORAGE_TYPE === 'firebase') {
        // Firebase Storage upload logic for new files
        for (const file of files) {
          const filename = `resources/${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
          const fileUpload = bucket.file(filename);
          
          const blobStream = fileUpload.createWriteStream({
            metadata: {
              contentType: file.mimetype
            }
          });
          
          await new Promise((resolve, reject) => {
            blobStream.on('error', (error) => reject(error));
            blobStream.on('finish', async () => {
              // Generate signed URL
              const [url] = await fileUpload.getSignedUrl({
                action: 'read',
                expires: '03-01-2500' // Far future
              });
              
              newFileData.push({
                filename: file.originalname,
                fileUrl: url,
                filePath: filename,
                fileType: file.mimetype,
                fileSize: file.size
              });
              
              resolve();
            });
            
            blobStream.end(file.buffer);
          });
        }
      } else {
        // Local storage logic for new files
        for (const file of files) {
          newFileData.push({
            filename: file.originalname,
            fileUrl: `/uploads/resources/${file.filename}`,
            filePath: `uploads/resources/${file.filename}`,
            fileType: file.mimetype,
            fileSize: file.size
          });
        }
      }

      // Add new files to resource
      resource.files = [...resource.files, ...newFileData];
    }

    // Update modified date
    resource.updatedAt = Date.now();

    // Save updated resource
    await resource.save();

    res.status(200).json({
      success: true,
      message: 'Resource updated successfully',
      data: resource
    });
  } catch (error) {
    console.error('Error updating resource:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating resource',
      error: error.message
    });
  }
};

/**
 * @desc    Delete a resource (for lecturers)
 * @route   DELETE /api/lecturer/resources/:id
 * @access  Private/Lecturer
 */
exports.deleteResource = async (req, res) => {
  try {
    const { id } = req.params;

    // Find resource and check ownership
    const resource = await Resource.findOne({
      _id: id,
      uploadedBy: req.user.id
    });

    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found or you are not authorized to delete it'
      });
    }

    // Delete files from storage
    if (resource.files && resource.files.length > 0) {
      if (process.env.STORAGE_TYPE === 'firebase') {
        // Delete from Firebase storage
        for (const file of resource.files) {
          if (file.filePath) {
            try {
              await bucket.file(file.filePath).delete();
            } catch (error) {
              console.warn(`Failed to delete file from storage: ${error.message}`);
            }
          }
        }
      } else {
        // Delete from local storage
        for (const file of resource.files) {
          if (file.filePath) {
            const fullPath = path.join(__dirname, '..', 'public', file.filePath);
            if (fs.existsSync(fullPath)) {
              fs.unlinkSync(fullPath);
            }
          }
        }
      }
    }

    // Delete associated data
    await Promise.all([
      SavedResource.deleteMany({ resource: id }),
      ResourceDownload.deleteMany({ resource: id })
    ]);

    // Delete the resource
    await Resource.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Resource deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting resource:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting resource',
      error: error.message
    });
  }
};