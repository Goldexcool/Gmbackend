const CourseResource = require('../models/CourseResource');
const Course = require('../models/Course');
const Lecturer = require('../models/Lecturer');
const Student = require('../models/Student');
const fs = require('fs');
const path = require('path');

// ==================== LECTURER FUNCTIONS ====================

// @desc    Upload a course resource
// @route   POST /api/courses/:courseId/resources
// @access  Private/Lecturer
exports.uploadResource = async (req, res) => {
  try {
    const { courseId } = req.params;
    const {
      title,
      description,
      resourceType,
      externalLink,
      academicSession,
      weekNumber,
      topic,
      visibleToStudents,
      downloadable
    } = req.body;
    
    // Validate required fields
    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a title for the resource'
      });
    }
    
    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Get lecturer profile
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found'
      });
    }
    
    // Check if lecturer teaches this course
    const isTeaching = course.lecturer.some(id => id.toString() === lecturer._id.toString());
    if (!isTeaching && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to upload resources for this course'
      });
    }
    
    // Process uploaded files if any
    const files = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        files.push({
          filename: file.originalname,
          fileUrl: `/uploads/resources/${file.filename}`,
          mimeType: file.mimetype,
          size: file.size
        });
      });
    } else if (!externalLink && resourceType !== 'link') {
      // If no files and no external link, return error (except for 'link' type)
      return res.status(400).json({
        success: false,
        message: 'Please upload a file or provide an external link'
      });
    }
    
    // Create resource
    const resource = new CourseResource({
      title,
      description,
      course: courseId,
      academicSession: academicSession || course.academicSession,
      lecturer: lecturer._id,
      resourceType,
      externalLink,
      files,
      weekNumber,
      topic,
      visibleToStudents: visibleToStudents !== undefined ? visibleToStudents : true,
      downloadable: downloadable !== undefined ? downloadable : true
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
      message: 'Error uploading resource',
      error: error.message
    });
  }
};

// @desc    Get lecturer's course resources
// @route   GET /api/lecturer/resources
// @access  Private/Lecturer
exports.getLecturerResources = async (req, res) => {
  try {
    const { course, type, academicSession } = req.query;
    
    // Find lecturer profile
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found'
      });
    }

    // Build query
    const query = { createdBy: lecturer._id };

    // Add optional filters
    if (course) query.course = course;
    if (type) query.resourceType = type;
    if (academicSession) query.academicSession = academicSession;

    // Find resources
    const resources = await CourseResource.find(query)
      .populate('course', 'code title')
      .populate('academicSession', 'name year')
      .sort('-createdAt');

    res.status(200).json({
      success: true,
      count: resources.length,
      data: resources
    });
  } catch (error) {
    console.error('Error getting resources:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting resources',
      error: error.message
    });
  }
};

// @desc    Get a single resource
// @route   GET /api/lecturer/resources/:id
// @access  Private/Lecturer
exports.getLecturerResource = async (req, res) => {
  try {
    const { id } = req.params;

    // Find lecturer profile
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found'
      });
    }

    // Find resource
    const resource = await CourseResource.findOne({
      _id: id,
      createdBy: lecturer._id
    })
    .populate('course', 'code title department level')
    .populate('academicSession', 'name year')
    .populate('createdBy', 'user')
    .populate({
      path: 'createdBy.user',
      select: 'name email'
    });

    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found or you are not authorized to view it'
      });
    }

    res.status(200).json({
      success: true,
      data: resource
    });
  } catch (error) {
    console.error('Error getting resource:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting resource',
      error: error.message
    });
  }
};

// @desc    Update resource
// @route   PUT /api/lecturer/resources/:id
// @access  Private/Lecturer
exports.updateResource = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      file,
      externalLink,
      week,
      topic,
      visibleToStudents,
      tags
    } = req.body;

    // Find lecturer profile
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found'
      });
    }

    // Find resource
    const resource = await CourseResource.findOne({
      _id: id,
      createdBy: lecturer._id
    });

    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found or you are not authorized to update it'
      });
    }

    // Update fields if provided
    if (title) resource.title = title;
    if (description !== undefined) resource.description = description;
    if (file) resource.file = file;
    if (externalLink !== undefined) resource.externalLink = externalLink;
    if (week !== undefined) resource.week = week;
    if (topic !== undefined) resource.topic = topic;
    if (visibleToStudents !== undefined) resource.visibleToStudents = visibleToStudents;
    if (tags) resource.tags = tags;

    await resource.save();

    res.status(200).json({
      success: true,
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

// @desc    Delete resource
// @route   DELETE /api/lecturer/resources/:id
// @access  Private/Lecturer
exports.deleteResource = async (req, res) => {
  try {
    const { id } = req.params;

    // Find lecturer profile
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found'
      });
    }

    // Find and delete resource
    const resource = await CourseResource.findOneAndDelete({
      _id: id,
      createdBy: lecturer._id
    });

    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found or you are not authorized to delete it'
      });
    }

    res.status(200).json({
      success: true,
      data: {}
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

// ==================== STUDENT FUNCTIONS ====================

/**
 * @desc    Get resources available to a student
 * @route   GET /api/student/resources
 * @access  Private/Student
 */
exports.getStudentResources = async (req, res) => {
  try {
    // Get query parameters for filtering
    const { 
      courseId, 
      academicSessionId,
      type, 
      category, 
      week,
      search,
      page = 1, 
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    // Find student profile
    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }
    
    // Build query - only show resources that are visible to students
    // and from courses the student is enrolled in
    const query = {
      course: { $in: student.courses },
      visibleToStudents: true
    };
    
    // Add filters if provided
    if (courseId) query.course = courseId;
    if (academicSessionId) query.academicSession = academicSessionId;
    if (type) query.resourceType = type;
    if (category) query.category = category;
    if (week) query.week = week;
    
    // Add search functionality
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Find resources with pagination and sorting
    const resources = await CourseResource.find(query)
      .populate('course', 'code title')
      .populate('academicSession', 'name year')
      .populate('lecturer', 'user')
      .populate('lecturer.user', 'name')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await CourseResource.countDocuments(query);
    
    // Calculate stats by course (for the student)
    const courseStats = await CourseResource.aggregate([
      { $match: { 
        course: { $in: student.courses },
        visibleToStudents: true
      }},
      { $group: {
        _id: '$course',
        count: { $sum: 1 },
        documentCount: { 
          $sum: { 
            $cond: [{ $eq: ['$resourceType', 'document'] }, 1, 0] 
          } 
        },
        linkCount: { 
          $sum: { 
            $cond: [{ $eq: ['$resourceType', 'link'] }, 1, 0] 
          } 
        },
        videoCount: { 
          $sum: { 
            $cond: [{ $eq: ['$resourceType', 'video'] }, 1, 0] 
          } 
        }
      }},
      { $sort: { count: -1 } }
    ]);
    
    // Get course details
    const coursesInfo = await Course.find({
      _id: { $in: courseStats.map(stat => stat._id) }
    }, 'code title');
    
    // Map course info to stats
    const statsWithCourseInfo = courseStats.map(stat => {
      const courseInfo = coursesInfo.find(
        c => c._id.toString() === stat._id.toString()
      );
      return {
        ...stat,
        course: courseInfo
      };
    });
    
    res.status(200).json({
      success: true,
      count: resources.length,
      total,
      pages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      data: resources,
      stats: {
        totalResources: total,
        byCourse: statsWithCourseInfo
      }
    });
  } catch (error) {
    console.error('Error getting student resources:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting student resources',
      error: error.message
    });
  }
};

/**
 * @desc    Get a specific resource for a student
 * @route   GET /api/student/resources/:id
 * @access  Private/Student
 */
exports.getStudentResource = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find student profile
    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }
    
    // Find the resource
    const resource = await CourseResource.findById(id)
      .populate('course', 'code title department level')
      .populate('academicSession', 'name year')
      .populate('lecturer', 'user')
      .populate('lecturer.user', 'name');
    
    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found'
      });
    }
    
    // Check if resource is visible to students
    if (!resource.visibleToStudents) {
      return res.status(403).json({
        success: false,
        message: 'This resource is not available to students'
      });
    }
    
    // Check if student is enrolled in the course
    const isEnrolled = student.courses.some(
      courseId => courseId.toString() === resource.course._id.toString()
    );
    
    if (!isEnrolled) {
      return res.status(403).json({
        success: false,
        message: 'You are not enrolled in this course'
      });
    }
    
    // Increment view count
    resource.views += 1;
    await resource.save();
    
    // Get related resources from same course and type
    const relatedResources = await CourseResource.find({
      _id: { $ne: id },
      course: resource.course._id,
      visibleToStudents: true
    })
    .select('title resourceType files.fileUrl externalLink category')
    .limit(5);
    
    res.status(200).json({
      success: true,
      data: resource,
      relatedResources
    });
  } catch (error) {
    console.error('Error getting student resource:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting student resource',
      error: error.message
    });
  }
};

/**
 * @desc    Download a resource (track download)
 * @route   GET /api/student/resources/:id/download
 * @access  Private/Student
 */
exports.downloadResource = async (req, res) => {
  try {
    const { id } = req.params;
    const { fileIndex = 0 } = req.query;
    
    // Find student profile
    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }
    
    // Find the resource
    const resource = await CourseResource.findById(id);
    
    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found'
      });
    }
    
    // Check if resource is visible to students
    if (!resource.visibleToStudents) {
      return res.status(403).json({
        success: false,
        message: 'This resource is not available to students'
      });
    }
    
    // Check if student is enrolled in the course
    const isEnrolled = student.courses.some(
      courseId => courseId.toString() === resource.course.toString()
    );
    
    if (!isEnrolled) {
      return res.status(403).json({
        success: false,
        message: 'You are not enrolled in this course'
      });
    }
    
    // Make sure resource has files and the requested index exists
    if (!resource.files || resource.files.length === 0 || !resource.files[fileIndex]) {
      return res.status(404).json({
        success: false,
        message: 'No file found for this resource'
      });
    }
    
    // Get the file
    const file = resource.files[fileIndex];
    const filePath = path.join(__dirname, '..', file.fileUrl);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found on server'
      });
    }
    
    // Increment download count
    resource.downloads += 1;
    await resource.save();
    
    // Send the file
    res.download(filePath, file.filename);
  } catch (error) {
    console.error('Error downloading resource:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading resource',
      error: error.message
    });
  }
};