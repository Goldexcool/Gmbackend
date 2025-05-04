const CourseRep = require('../models/CourseRep');
const CourseRepChat = require('../models/CourseRepChat');
const Course = require('../models/Course');
const Student = require('../models/Student');
const Lecturer = require('../models/Lecturer');
const User = require('../models/User');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

/**
 * @desc    Get all course reps assigned by a lecturer
 * @route   GET /api/lecturer/course-reps
 * @access  Private/Lecturer
 */
exports.getCourseReps = async (req, res) => {
  try {
    // Find lecturer profile
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found'
      });
    }
    
    // Get courses taught by this lecturer
    const courses = await Course.find({ lecturer: lecturer._id });
    
    if (courses.length === 0) {
      return res.status(200).json({
        success: true,
        data: []
      });
    }
    
    // Get course IDs
    const courseIds = courses.map(course => course._id);
    
    // Find course reps for these courses
    const courseReps = await CourseRep.find({
      course: { $in: courseIds },
      assignedBy: lecturer._id,
      isActive: true
    })
    .populate({
      path: 'student',
      select: 'matricNumber',
      populate: { path: 'user', select: 'fullName email avatar' }
    })
    .populate('course', 'code title');
    
    res.status(200).json({
      success: true,
      count: courseReps.length,
      data: courseReps
    });
  } catch (error) {
    console.error('Error fetching course reps:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching course reps',
      error: error.message
    });
  }
};

/**
 * @desc    Assign a student as course rep
 * @route   POST /api/lecturer/courses/:courseId/course-rep
 * @access  Private/Lecturer
 */
exports.assignCourseRep = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { studentId, responsibilities } = req.body;
    
    // Find lecturer profile
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found'
      });
    }
    
    // Check if course exists and the lecturer teaches it
    const course = await Course.findOne({
      _id: courseId,
      lecturer: lecturer._id
    });
    
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found or you are not assigned to this course'
      });
    }
    
    // Check if student exists and is enrolled in the course
    const student = await Student.findById(studentId);
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }
    
    if (!student.courses.includes(courseId)) {
      return res.status(400).json({
        success: false,
        message: 'Student is not enrolled in this course'
      });
    }
    
    // Check if course already has an active rep
    const existingRep = await CourseRep.findOne({
      course: courseId,
      isActive: true
    });
    
    if (existingRep) {
      // Update existing course rep to inactive
      existingRep.isActive = false;
      await existingRep.save();
    }
    
    // Create new course rep
    const courseRep = await CourseRep.create({
      course: courseId,
      student: studentId,
      assignedBy: lecturer._id,
      responsibilities: responsibilities || [],
      isActive: true
    });
    
    // Update course with new rep
    course.courseRep = studentId;
    await course.save();
    
    // Create a chat channel for lecturer and course rep
    const chat = await CourseRepChat.create({
      courseRep: courseRep._id,
      lecturer: lecturer._id,
      course: courseId,
      messages: [],
      isActive: true
    });
    
    // Populate response data
    await courseRep.populate([
      {
        path: 'student',
        select: 'matricNumber',
        populate: { path: 'user', select: 'fullName email avatar' }
      },
      { path: 'course', select: 'code title' }
    ]);
    
    res.status(201).json({
      success: true,
      message: 'Course representative assigned successfully',
      data: {
        courseRep,
        chatId: chat._id
      }
    });
  } catch (error) {
    console.error('Error assigning course rep:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning course rep',
      error: error.message
    });
  }
};

/**
 * @desc    Remove a course rep
 * @route   DELETE /api/lecturer/course-reps/:repId
 * @access  Private/Lecturer
 */
exports.removeCourseRep = async (req, res) => {
  try {
    const { repId } = req.params;
    
    // Find lecturer profile
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found'
      });
    }
    
    // Find the course rep
    const courseRep = await CourseRep.findOne({
      _id: repId,
      assignedBy: lecturer._id
    });
    
    if (!courseRep) {
      return res.status(404).json({
        success: false,
        message: 'Course rep not found or you did not assign this rep'
      });
    }
    
    // Update course rep to inactive
    courseRep.isActive = false;
    await courseRep.save();
    
    // Remove from course
    await Course.findByIdAndUpdate(
      courseRep.course,
      { $unset: { courseRep: "" } }
    );
    
    // Deactivate chat
    await CourseRepChat.findOneAndUpdate(
      { courseRep: repId, lecturer: lecturer._id },
      { isActive: false }
    );
    
    res.status(200).json({
      success: true,
      message: 'Course representative removed successfully',
      data: { id: repId }
    });
  } catch (error) {
    console.error('Error removing course rep:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing course rep',
      error: error.message
    });
  }
};

/**
 * @desc    Get students enrolled in a course
 * @route   GET /api/lecturer/courses/:courseId/students
 * @access  Private/Lecturer
 */
exports.getEnrolledStudents = async (req, res) => {
  try {
    const { courseId } = req.params;
    
    // Find lecturer profile
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found'
      });
    }
    
    // Check if course exists and the lecturer teaches it
    const course = await Course.findOne({
      _id: courseId,
      lecturer: lecturer._id
    });
    
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found or you are not assigned to this course'
      });
    }
    
    // Find students enrolled in this course
    const students = await Student.find({
      courses: courseId
    })
    .populate('user', 'fullName email avatar')
    .select('matricNumber level');
    
    // Check if any student is a course rep
    const courseRep = await CourseRep.findOne({
      course: courseId,
      isActive: true
    });
    
    // Map students and indicate if they are a course rep
    const formattedStudents = students.map(student => {
      const isRep = courseRep && courseRep.student.toString() === student._id.toString();
      return {
        ...student.toObject(),
        isCourseRep: isRep
      };
    });
    
    res.status(200).json({
      success: true,
      count: students.length,
      data: formattedStudents
    });
  } catch (error) {
    console.error('Error fetching enrolled students:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching enrolled students',
      error: error.message
    });
  }
};

/**
 * @desc    Get students by department and level
 * @route   GET /api/lecturer/students
 * @access  Private/Lecturer
 */
exports.getStudentsByDepartmentAndLevel = async (req, res) => {
  try {
    const { department, level } = req.query;
    
    // Build query
    const query = {};
    
    if (department) {
      query.department = department;
    }
    
    if (level) {
      query.level = parseInt(level);
    }
    
    // Find students
    const students = await Student.find(query)
      .populate('user', 'fullName email avatar')
      .populate('department', 'name')
      .select('matricNumber level');
    
    res.status(200).json({
      success: true,
      count: students.length,
      data: students
    });
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching students',
      error: error.message
    });
  }
};

/**
 * @desc    Get chat messages with a course rep
 * @route   GET /api/lecturer/course-reps/:repId/chat
 * @access  Private/Lecturer
 */
exports.getChatMessages = async (req, res) => {
  try {
    const { repId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    // Find lecturer profile
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found'
      });
    }
    
    // Find the course rep
    const courseRep = await CourseRep.findOne({
      _id: repId,
      assignedBy: lecturer._id
    });
    
    if (!courseRep) {
      return res.status(404).json({
        success: false,
        message: 'Course rep not found or you did not assign this rep'
      });
    }
    
    // Find the chat
    const chat = await CourseRepChat.findOne({
      courseRep: repId,
      lecturer: lecturer._id
    })
    .populate({
      path: 'courseRep',
      populate: {
        path: 'student',
        select: 'matricNumber',
        populate: { path: 'user', select: 'fullName email avatar' }
      }
    })
    .populate('course', 'code title');
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }
    
    // Sort messages by date (newest first) and apply pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const totalMessages = chat.messages.length;
    
    // Get paginated messages
    const messages = chat.messages
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(skip, skip + parseInt(limit))
      .reverse(); // Reverse back to chronological order
    
    // Mark unread messages as read if they're from the student
    const unreadMessages = messages.filter(msg => 
      !msg.read && msg.senderRole === 'course_rep'
    );
    
    if (unreadMessages.length > 0) {
      for (const msg of unreadMessages) {
        msg.read = true;
        msg.readAt = new Date();
      }
      
      // Update last message if it was unread
      if (chat.lastMessage && 
          chat.lastMessage.sender.toString() !== req.user.id && 
          !chat.lastMessage.read) {
        chat.lastMessage.read = true;
      }
      
      await chat.save();
    }
    
    res.status(200).json({
      success: true,
      count: messages.length,
      pagination: {
        total: totalMessages,
        page: parseInt(page),
        pages: Math.ceil(totalMessages / parseInt(limit))
      },
      data: {
        chat: {
          _id: chat._id,
          course: chat.course,
          courseRep: chat.courseRep
        },
        messages
      }
    });
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching chat messages',
      error: error.message
    });
  }
};

/**
 * @desc    Send a message to a course rep
 * @route   POST /api/lecturer/course-reps/:repId/chat
 * @access  Private/Lecturer
 */
exports.sendMessage = async (req, res) => {
  try {
    const { repId } = req.params;
    const { message } = req.body;
    
    console.log('Request body:', req.body); // Add this for debugging
    
    // Validate message - fix the validation check
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Message text is required'
      });
    }
    
    // Find the course rep
    const courseRep = await CourseRep.findById(repId);
    if (!courseRep) {
      return res.status(404).json({
        success: false,
        message: 'Course rep not found'
      });
    }
    
    // Find lecturer profile
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found'
      });
    }
    
    // Find the chat
    let chat = await CourseRepChat.findOne({
      courseRep: repId,
      lecturer: lecturer._id
    });
    
    if (!chat) {
      console.log(`Chat not found for rep ${repId}, creating a new one...`);
      
      // Get the course for this course rep
      const course = await Course.findById(courseRep.course);
      if (!course) {
        return res.status(404).json({
          success: false,
          message: 'Course associated with this rep not found'
        });
      }
      
      // Create a new chat
      chat = await CourseRepChat.create({
        courseRep: repId,
        lecturer: lecturer._id,
        course: course._id,
        messages: [],
        isActive: true,
        lastMessage: null
      });
      
      console.log(`Created new chat with ID: ${chat._id}`);
    }
    
    // Process attachments if any
    const attachments = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        attachments.push({
          filename: file.filename,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          path: file.path
        });
      });
    }
    
    // Create new message with required 'text' field instead of 'message'
    const newMessage = {
      sender: req.user.id,
      senderRole: 'lecturer',
      text: message,         // Changed from 'message' to 'text'
      attachments,
      createdAt: new Date(),
      read: false
    };
    
    // Add message to chat
    chat.messages.push(newMessage);
    
    // Update last message
    chat.lastMessage = {
      sender: req.user.id,
      text: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
      timestamp: new Date(),
      read: false
    };
    
    // Save the chat
    await chat.save();
    
    // Send notification to student course rep
    const student = await Student.findById(courseRep.student);
    if (student) {
      // Create notification
      const notification = {
        recipient: student.user,
        type: 'message',
        message: `New message from ${req.user.name || 'Lecturer'}`,
        referenceId: chat._id,
        referenceModel: 'CourseRepChat'
      };
      
      if (global.models && global.models.Notification) {
        await global.models.Notification.create(notification);
      }
    }
    
    res.status(201).json({
      success: true,
      data: newMessage
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending message',
      error: error.message
    });
  }
};

/**
 * @desc    Simple check if student is a course representative
 * @route   GET /api/student/is-course-rep
 * @access  Private/Student
 */
exports.checkIfCourseRep = async (req, res) => {
  try {
    // Find student profile
    const student = await Student.findOne({ user: req.user.id });
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }
    
    // Simple check if student is a course rep for any course
    const isCourseRep = await CourseRep.exists({
      student: student._id,
      isActive: true
    });
    
    res.status(200).json({
      success: true,
      isCourseRep: !!isCourseRep
    });
  } catch (error) {
    console.error('Error checking course rep status:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking course rep status',
      error: error.message
    });
  }
};