const ResourceLibrary = require('../models/ResourceLibrary');
const User = require('../models/User');
const Department = require('../models/Department');
const Course = require('../models/Course');
const StudyGroup = require('../models/StudyGroup');
const GroupMessage = require('../models/GroupMessage');
const externalResourceService = require('../services/externalResourceService');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { getSignedUrl } = require('../utils/fileStorage');

/**
 * @desc    Search resources (local and external)
 * @route   GET /api/resources/library/search
 * @access  Private
 */
exports.searchResources = async (req, res) => {
  try {
    const { 
      query, 
      type, 
      level, 
      department, 
      course,
      sources = 'local,googleBooks,core', 
      page = 1, 
      limit = 20 
    } = req.query;

    if (!query && !type && !level && !department && !course) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one search parameter'
      });
    }

    const options = {
      maxResults: parseInt(limit),
      sources: sources.split(',')
    };

    // Only search external sources if we have a text query
    if (!query) {
      options.sources = ['local'];
    }

    // Build filter for local search
    const filter = { isApproved: true };
    
    if (query) {
      filter.$text = { $search: query };
    }
    
    if (type) {
      filter.resourceType = type;
    }
    
    if (level) {
      filter.level = parseInt(level);
    }
    
    if (department) {
      filter.departments = department;
    }
    
    if (course) {
      filter.subjects = course;
    }

    // Get resources from our database
    const [localResources, totalLocalCount] = await Promise.all([
      ResourceLibrary.find(filter)
        .populate('uploadedBy', 'fullName avatar')
        .populate('subjects', 'code title')
        .populate('departments', 'name')
        .sort(query ? { score: { $meta: 'textScore' } } : { createdAt: -1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit)),
      ResourceLibrary.countDocuments(filter)
    ]);

    // Get resources from external sources if there's a text query
    let externalResults = {};
    if (query && options.sources.some(s => s !== 'local')) {
      const sourcesToSearch = options.sources.filter(s => s !== 'local');
      const externalData = await externalResourceService.searchAllSources(query, {
        ...options,
        sources: sourcesToSearch
      });
      externalResults = externalData.external;
    }

    res.status(200).json({
      success: true,
      count: {
        local: totalLocalCount,
        external: Object.values(externalResults).reduce((sum, arr) => sum + arr.length, 0)
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(totalLocalCount / parseInt(limit))
      },
      data: {
        local: localResources,
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
 * @desc    Import external resource to library
 * @route   POST /api/resources/library/import
 * @access  Private
 */
exports.importExternalResource = async (req, res) => {
  try {
    const { resourceData, accessLevel, courseIds, departmentIds } = req.body;
    
    if (!resourceData || !resourceData.source) {
      return res.status(400).json({
        success: false,
        message: 'Resource data is required'
      });
    }
    
    // Add department and course IDs if provided
    if (departmentIds && Array.isArray(departmentIds)) {
      resourceData.departments = departmentIds;
    }
    
    if (courseIds && Array.isArray(courseIds)) {
      resourceData.subjects = courseIds;
    }
    
    const resource = await externalResourceService.importExternalResource(
      resourceData,
      req.user.id,
      accessLevel || 'public'
    );
    
    res.status(201).json({
      success: true,
      message: 'Resource imported successfully',
      data: resource
    });
  } catch (error) {
    console.error('Error importing external resource:', error);
    res.status(500).json({
      success: false,
      message: 'Error importing external resource',
      error: error.message
    });
  }
};

/**
 * @desc    Upload a new resource
 * @route   POST /api/resources/library
 * @access  Private
 */
exports.uploadResource = async (req, res) => {
  try {
    const {
      title,
      description,
      resourceType,
      externalLink,
      author,
      publisher,
      publicationYear,
      isbn,
      tags,
      courseIds,
      departmentIds,
      level,
      accessLevel = 'public'
    } = req.body;

    // Validate required fields
    if (!title || !resourceType) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title and resource type'
      });
    }

    // If type is link, external link is required
    if (resourceType === 'link' && !externalLink) {
      return res.status(400).json({
        success: false,
        message: 'External link is required for link type resources'
      });
    }

    // Process file upload if any
    let fileData = null;
    if (req.file) {
      fileData = {
        filename: req.file.originalname,
        fileUrl: `/uploads/resources/${req.file.filename}`,
        mimeType: req.file.mimetype,
        size: req.file.size
      };
    } else if (resourceType !== 'link' && !externalLink) {
      return res.status(400).json({
        success: false,
        message: 'File is required for non-link resources'
      });
    }

    // Determine file format from MIME type or extension
    let format = 'link';
    if (fileData) {
      const extension = path.extname(fileData.filename).toLowerCase().substring(1);
      const mimeTypeMap = {
        'application/pdf': 'pdf',
        'application/msword': 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/vnd.ms-powerpoint': 'ppt',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
        'text/plain': 'txt',
        'video/mp4': 'mp4',
        'audio/mpeg': 'mp3',
        'image/jpeg': 'jpg',
        'image/png': 'png'
      };
      
      format = mimeTypeMap[fileData.mimeType] || extension || 'other';
    }

    // Parse tags
    const parsedTags = tags ? 
      (Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim())) : 
      [];

    // Create resource document
    const resource = await ResourceLibrary.create({
      title,
      description,
      resourceType,
      format,
      author,
      publisher,
      publicationYear: publicationYear ? parseInt(publicationYear) : undefined,
      isbn,
      tags: parsedTags,
      subjects: courseIds ? JSON.parse(courseIds) : [],
      departments: departmentIds ? JSON.parse(departmentIds) : [],
      level: level ? parseInt(level) : undefined,
      fileUrl: fileData ? fileData.fileUrl : null,
      externalLink,
      uploadedBy: req.user.id,
      accessLevel,
      // For lecturer or admin uploads, auto-approve
      isApproved: ['lecturer', 'admin'].includes(req.user.role)
    });

    res.status(201).json({
      success: true,
      message: 'Resource uploaded successfully',
      data: resource
    });
  } catch (error) {
    console.error('Error uploading resource:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading resource',
      error: error.message
    });
  }
};

/**
 * @desc    Get resource details
 * @route   GET /api/resources/library/:id
 * @access  Private
 */
exports.getResourceDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find resource and increment view count
    const resource = await ResourceLibrary.findByIdAndUpdate(
      id,
      { $inc: { views: 1 } },
      { new: true }
    )
    .populate('uploadedBy', 'fullName avatar')
    .populate('subjects', 'code title')
    .populate('departments', 'name')
    .populate({
      path: 'ratings',
      populate: {
        path: 'user',
        select: 'fullName avatar'
      }
    });
    
    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found'
      });
    }
    
    // Check if user has permission to access this resource
    if (resource.accessLevel !== 'public') {
      // Handle permission checks for department, level, course access
      // Implementation depends on your user model structure
    }
    
    // Get related resources
    const relatedResources = await ResourceLibrary.find({
      _id: { $ne: id },
      $or: [
        { subjects: { $in: resource.subjects } },
        { resourceType: resource.resourceType },
        { tags: { $in: resource.tags } }
      ],
      isApproved: true
    })
    .select('title resourceType thumbnail fileUrl externalLink views downloads ratings')
    .limit(5);
    
    // Check if the user has rated this resource
    const userRating = resource.ratings.find(
      rating => rating.user && rating.user._id.toString() === req.user.id
    );
    
    res.status(200).json({
      success: true,
      data: {
        resource,
        userRating: userRating ? userRating.rating : null,
        relatedResources
      }
    });
  } catch (error) {
    console.error('Error getting resource details:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting resource details',
      error: error.message
    });
  }
};

/**
 * @desc    Download or access resource
 * @route   GET /api/resources/library/:id/download
 * @access  Private
 */
exports.downloadResource = async (req, res) => {
  try {
    const { id } = req.params;
    
    const resource = await ResourceLibrary.findByIdAndUpdate(
      id,
      { $inc: { downloads: 1 } }
    );
    
    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found'
      });
    }
    
    // Check access permissions
    if (resource.accessLevel !== 'public' && resource.uploadedBy.toString() !== req.user.id) {
      // Implement permission checks
    }
    
    // If external link, redirect
    if (resource.externalLink && !resource.fileUrl) {
      return res.status(200).json({
        success: true,
        data: {
          redirectUrl: resource.externalLink
        }
      });
    }
    
    // If local file, generate download URL or serve the file
    if (resource.fileUrl) {
      const filePath = path.join(__dirname, '..', 'public', resource.fileUrl);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          message: 'File not found'
        });
      }
      
      // Send file for download
      return res.download(filePath, resource.title + path.extname(resource.fileUrl));
    }
    
    res.status(400).json({
      success: false,
      message: 'No file or link available'
    });
  } catch (error) {
    console.error('Error downloading resource:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading resource',
      error: error.message
    });
  }
};

/**
 * @desc    Rate a resource
 * @route   POST /api/resources/library/:id/rate
 * @access  Private
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
    
    const resource = await ResourceLibrary.findById(id);
    
    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found'
      });
    }
    
    // Check if user already rated this resource
    const existingRatingIndex = resource.ratings.findIndex(
      r => r.user && r.user.toString() === req.user.id
    );
    
    if (existingRatingIndex > -1) {
      // Update existing rating
      resource.ratings[existingRatingIndex].rating = rating;
      if (review) {
        resource.ratings[existingRatingIndex].review = review;
      }
      resource.ratings[existingRatingIndex].date = Date.now();
    } else {
      // Add new rating
      resource.ratings.push({
        user: req.user.id,
        rating,
        review: review || '',
        date: Date.now()
      });
    }
    
    // Update average rating
    const total = resource.ratings.reduce((sum, r) => sum + r.rating, 0);
    resource.averageRating = (total / resource.ratings.length).toFixed(1);
    
    await resource.save();
    
    res.status(200).json({
      success: true,
      message: 'Resource rated successfully',
      data: {
        rating,
        averageRating: resource.averageRating,
        ratingsCount: resource.ratings.length
      }
    });
  } catch (error) {
    console.error('Error rating resource:', error);
    res.status(500).json({
      success: false,
      message: 'Error rating resource',
      error: error.message
    });
  }
};

/**
 * @desc    Share resource to study group or other users
 * @route   POST /api/resources/library/:id/share
 * @access  Private
 */
exports.shareResource = async (req, res) => {
  try {
    const { id } = req.params;
    const { groupId, message, userIds } = req.body;
    
    if (!groupId && (!userIds || !Array.isArray(userIds) || userIds.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a group ID or list of user IDs'
      });
    }
    
    const resource = await ResourceLibrary.findById(id);
    
    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found'
      });
    }
    
    // Increment share count
    resource.shares += 1;
    await resource.save();
    
    // If sharing to a group
    if (groupId) {
      const group = await StudyGroup.findById(groupId);
      
      if (!group) {
        return res.status(404).json({
          success: false,
          message: 'Study group not found'
        });
      }
      
      // Check if user is member of the group
      if (!group.members.some(member => member.user.toString() === req.user.id)) {
        return res.status(403).json({
          success: false,
          message: 'You are not a member of this group'
        });
      }
      
      // Create a message with the resource attached
      const newMessage = await GroupMessage.create({
        group: groupId,
        sender: req.user.id,
        text: message || `Check out this resource: ${resource.title}`,
        attachments: [{
          resourceId: resource._id,
          title: resource.title,
          type: resource.resourceType,
          url: resource.fileUrl || resource.externalLink
        }]
      });
      
      // Update group with last message
      await StudyGroup.findByIdAndUpdate(
        groupId,
        {
          lastActivity: Date.now(),
          lastMessage: {
            text: newMessage.text,
            sender: req.user.id,
            timestamp: Date.now()
          }
        }
      );
      
      return res.status(200).json({
        success: true,
        message: 'Resource shared to group successfully',
        data: {
          groupId,
          messageId: newMessage._id
        }
      });
    }
    
    // If sharing to individual users
    if (userIds && userIds.length > 0) {
      // Implementation for direct messaging
      // Create a conversation or message in your chat system
      
      return res.status(200).json({
        success: true,
        message: 'Resource shared with users successfully',
        data: {
          sharedWith: userIds.length
        }
      });
    }
  } catch (error) {
    console.error('Error sharing resource:', error);
    res.status(500).json({
      success: false,
      message: 'Error sharing resource',
      error: error.message
    });
  }
};

/**
 * @desc    Get featured or trending resources
 * @route   GET /api/resources/library/featured
 * @access  Private
 */
exports.getFeaturedResources = async (req, res) => {
  try {
    const { limit = 10, type } = req.query;
    
    const filter = { isApproved: true };
    if (type) {
      filter.resourceType = type;
    }
    
    // Get featured resources
    const featuredResources = await ResourceLibrary.find({
      ...filter,
      isFeatured: true
    })
    .populate('uploadedBy', 'fullName avatar')
    .populate('subjects', 'code title')
    .limit(parseInt(limit));
    
    // Get trending resources (most viewed/downloaded)
    const trendingResources = await ResourceLibrary.find(filter)
      .sort({ views: -1, downloads: -1, createdAt: -1 })
      .populate('uploadedBy', 'fullName avatar')
      .limit(parseInt(limit));
    
    // Get recent uploads
    const recentResources = await ResourceLibrary.find(filter)
      .sort({ createdAt: -1 })
      .populate('uploadedBy', 'fullName avatar')
      .limit(parseInt(limit));
    
    // Get highest rated
    const topRatedResources = await ResourceLibrary.find({
      ...filter,
      'ratings.0': { $exists: true }
    })
      .sort({ averageRating: -1, 'ratings.length': -1 })
      .populate('uploadedBy', 'fullName avatar')
      .limit(parseInt(limit));
    
    res.status(200).json({
      success: true,
      data: {
        featured: featuredResources,
        trending: trendingResources,
        recent: recentResources,
        topRated: topRatedResources
      }
    });
  } catch (error) {
    console.error('Error getting featured resources:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting featured resources',
      error: error.message
    });
  }
};