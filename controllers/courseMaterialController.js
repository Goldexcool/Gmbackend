const CourseMaterial = require('../models/CourseMaterial');
const Course = require('../models/Course');
const Lecturer = require('../models/Lecturer');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const AcademicSession = require('../models/AcademicSession');
const mongoose = require('mongoose');

// @desc    Upload course material
// @route   POST /api/lecturer/materials
// @access  Private (Lecturers only)
exports.uploadMaterial = async (req, res) => {
  try {
    const {
      title, description, courseId, type,
      fileUrl, externalLink, weekNumber,
      topic, tags, isPublished, isDownloadable,
      academicSessionId
    } = req.body;
    
    // Validate required fields
    if (!title || !courseId || !type) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title, courseId, and type'
      });
    }
    
    // Validate file/link based on type
    if ((type === 'slide' || type === 'document' || type === 'video') && !fileUrl) {
      return res.status(400).json({
        success: false,
        message: `Please provide fileUrl for ${type} material`
      });
    }
    
    if (type === 'link' && !externalLink) {
      return res.status(400).json({
        success: false,
        message: 'Please provide externalLink for link material'
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
    
    // Verify the lecturer is assigned to this course
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    if (!course.lecturer.includes(lecturer._id)) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to teach this course'
      });
    }
    
    // Get active academic session if not provided
    let academicSession = academicSessionId;
    if (!academicSession) {
      const activeSession = await AcademicSession.findOne({ isActive: true });
      if (!activeSession) {
        return res.status(400).json({
          success: false,
          message: 'No active academic session found'
        });
      }
      academicSession = activeSession._id;
    }
    
    // Create material
    const material = new CourseMaterial({
      title,
      description: description || '',
      course: courseId,
      lecturer: lecturer._id,
      academicSession,
      type,
      fileUrl,
      externalLink,
      weekNumber: weekNumber || null,
      topic: topic || '',
      tags: tags || [],
      isPublished: isPublished !== undefined ? isPublished : true,
      isDownloadable: isDownloadable !== undefined ? isDownloadable : true
    });
    
    await material.save();
    
    res.status(201).json({
      success: true,
      message: 'Material uploaded successfully',
      data: material
    });
  } catch (error) {
    console.error('Error uploading material:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get all materials by lecturer
// @route   GET /api/lecturer/materials
// @access  Private (Lecturers only)
exports.getLecturerMaterials = async (req, res) => {
  try {
    const { courseId, type, academicSession, published } = req.query;
    
    // Get lecturer profile
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found'
      });
    }
    
    // Build query
    const query = { lecturer: lecturer._id };
    
    // Add filters
    if (courseId) query.course = courseId;
    if (type) query.type = type;
    if (academicSession) query.academicSession = academicSession;
    if (published !== undefined) query.isPublished = published === 'true';
    
    // Get materials
    const materials = await CourseMaterial.find(query)
      .populate('course', 'code title')
      .populate('academicSession', 'name year')
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: materials.length,
      data: materials
    });
  } catch (error) {
    console.error('Error fetching materials:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get material by ID
// @route   GET /api/lecturer/materials/:id
// @access  Private (Material creator only)
exports.getMaterialById = async (req, res) => {
  try {
    // Get lecturer profile
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found'
      });
    }
    
    // Find material
    const material = await CourseMaterial.findById(req.params.id)
      .populate('course', 'code title')
      .populate('academicSession', 'name year');
    
    if (!material) {
      return res.status(404).json({
        success: false,
        message: 'Material not found'
      });
    }
    
    // Check if lecturer created this material
    if (material.lecturer.toString() !== lecturer._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this material'
      });
    }
    
    res.status(200).json({
      success: true,
      data: material
    });
  } catch (error) {
    console.error('Error fetching material:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Update material
// @route   PUT /api/lecturer/materials/:id
// @access  Private (Material creator only)
exports.updateMaterial = async (req, res) => {
  try {
    const {
      title, description, type, fileUrl, externalLink,
      weekNumber, topic, tags, isPublished, isDownloadable
    } = req.body;
    
    // Get lecturer profile
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found'
      });
    }
    
    // Find material
    const material = await CourseMaterial.findById(req.params.id);
    
    if (!material) {
      return res.status(404).json({
        success: false,
        message: 'Material not found'
      });
    }
    
    // Check if lecturer created this material
    if (material.lecturer.toString() !== lecturer._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this material'
      });
    }
    
    // Update fields if provided
    if (title) material.title = title;
    if (description !== undefined) material.description = description;
    
    // If changing type, ensure appropriate URL is provided
    if (type) {
      material.type = type;
      
      if ((type === 'slide' || type === 'document' || type === 'video') && !material.fileUrl && !fileUrl) {
        return res.status(400).json({
          success: false,
          message: `Please provide fileUrl for ${type} material`
        });
      }
      
      if (type === 'link' && !material.externalLink && !externalLink) {
        return res.status(400).json({
          success: false,
          message: 'Please provide externalLink for link material'
        });
      }
    }
    
    if (fileUrl) material.fileUrl = fileUrl;
    if (externalLink) material.externalLink = externalLink;
    if (weekNumber !== undefined) material.weekNumber = weekNumber;
    if (topic !== undefined) material.topic = topic;
    if (tags) material.tags = tags;
    if (isPublished !== undefined) material.isPublished = isPublished;
    if (isDownloadable !== undefined) material.isDownloadable = isDownloadable;
    
    material.updatedAt = new Date();
    await material.save();
    
    res.status(200).json({
      success: true,
      message: 'Material updated successfully',
      data: material
    });
  } catch (error) {
    console.error('Error updating material:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Delete material
// @route   DELETE /api/lecturer/materials/:id
// @access  Private (Material creator only)
exports.deleteMaterial = async (req, res) => {
  try {
    // Get lecturer profile
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found'
      });
    }
    
    // Find material
    const material = await CourseMaterial.findById(req.params.id);
    
    if (!material) {
      return res.status(404).json({
        success: false,
        message: 'Material not found'
      });
    }
    
    // Check if lecturer created this material
    if (material.lecturer.toString() !== lecturer._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this material'
      });
    }
    
    await material.deleteOne();
    
    res.status(200).json({
      success: true,
      message: 'Material deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting material:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get materials for a course (student view)
// @route   GET /api/student/materials
// @access  Private (Students only)
exports.getStudentCourseMaterials = async (req, res) => {
  try {
    const { courseId, type, weekNumber } = req.query;
    
    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide courseId'
      });
    }
    
    // Get student profile
    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }
    
    // Check if student is enrolled in the course
    const enrollment = await Enrollment.findOne({
      student: student._id,
      course: courseId,
      status: 'active'
    });
    
    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: 'You are not enrolled in this course'
      });
    }
    
    // Build query
    const query = {
      course: courseId,
      isPublished: true
    };
    
    // Add filters
    if (type) query.type = type;
    if (weekNumber) query.weekNumber = weekNumber;
    
    // Get materials
    const materials = await CourseMaterial.find(query)
      .populate('course', 'code title')
      .populate('academicSession', 'name year')
      .sort({ weekNumber: 1, createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: materials.length,
      data: materials
    });
  } catch (error) {
    console.error('Error fetching student materials:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Record material view
// @route   POST /api/student/materials/:id/view
// @access  Private (Students only)
exports.recordMaterialView = async (req, res) => {
  try {
    const materialId = req.params.id;
    
    // Get student profile
    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }
    
    // Find material
    const material = await CourseMaterial.findById(materialId);
    
    if (!material) {
      return res.status(404).json({
        success: false,
        message: 'Material not found'
      });
    }
    
    // Check if material is published
    if (!material.isPublished) {
      return res.status(403).json({
        success: false,
        message: 'This material is not available'
      });
    }
    
    // Check if student is enrolled in the course
    const enrollment = await Enrollment.findOne({
      student: student._id,
      course: material.course,
      status: 'active'
    });
    
    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: 'You are not enrolled in this course'
      });
    }
    
    // Increment view count
    material.viewCount += 1;
    await material.save();
    
    res.status(200).json({
      success: true,
      message: 'View recorded successfully',
      data: {
        materialId,
        viewCount: material.viewCount
      }
    });
  } catch (error) {
    console.error('Error recording view:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};