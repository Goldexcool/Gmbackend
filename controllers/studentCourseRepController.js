const CourseRep = require('../models/CourseRep');
const CourseRepChat = require('../models/CourseRepChat');
const Student = require('../models/Student');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

/**
 * @desc    Get course rep status for a student
 * @route   GET /api/student/course-rep/status
 * @access  Private/Student
 */
exports.getRepStatus = async (req, res) => {
  try {
    // Find student profile
    const student = await Student.findOne({ user: req.user.id });
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }
    
    // Check if student is a course rep for any course
    const courseReps = await CourseRep.find({
      student: student._id,
      isActive: true
    })
    .populate('course', 'code title')
    .populate({
      path: 'assignedBy',
      select: 'user',
      populate: { path: 'user', select: 'fullName email' }
    });
    
    // Get chat for each course rep role
    const courseRepWithChats = await Promise.all(courseReps.map(async (rep) => {
      const chat = await CourseRepChat.findOne({
        courseRep: rep._id,
        isActive: true
      });
      
      return {
        ...rep.toObject(),
        chatId: chat ? chat._id : null,
        unreadMessages: chat ? chat.messages.filter(msg => 
          !msg.read && msg.senderRole === 'lecturer'
        ).length : 0
      };
    }));
    
    res.status(200).json({
      success: true,
      isCourseRep: courseReps.length > 0,
      count: courseReps.length,
      data: courseRepWithChats
    });
  } catch (error) {
    console.error('Error getting course rep status:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting course rep status',
      error: error.message
    });
  }
};

/**
 * @desc    Get chat messages with a lecturer
 * @route   GET /api/student/course-rep/:repId/chat
 * @access  Private/Student
 */
exports.getChatMessages = async (req, res) => {
  try {
    const { repId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    // Find student profile
    const student = await Student.findOne({ user: req.user.id });
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }
    
    // Find the course rep and ensure this student is the rep
    const courseRep = await CourseRep.findOne({
      _id: repId,
      student: student._id,
      isActive: true
    });
    
    if (!courseRep) {
      return res.status(404).json({
        success: false,
        message: 'Course rep not found or you are not the assigned rep'
      });
    }
    
    // Find the chat
    const chat = await CourseRepChat.findOne({
      courseRep: repId,
      isActive: true
    })
    .populate({
      path: 'lecturer',
      select: 'user',
      populate: { path: 'user', select: 'fullName email avatar' }
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
    
    // Mark unread messages as read if they're from the lecturer
    const unreadMessages = messages.filter(msg => 
      !msg.read && msg.senderRole === 'lecturer'
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
          lecturer: chat.lecturer
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
 * @desc    Send a message to a lecturer
 * @route   POST /api/student/course-rep/:repId/chat
 * @access  Private/Student
 */
exports.sendMessage = async (req, res) => {
  try {
    const { repId } = req.params;
    const { text } = req.body;
    
    if (!text || text.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Message text is required'
      });
    }
    
    // Find student profile
    const student = await Student.findOne({ user: req.user.id });
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }
    
    // Find the course rep and ensure this student is the rep
    const courseRep = await CourseRep.findOne({
      _id: repId,
      student: student._id,
      isActive: true
    });
    
    if (!courseRep) {
      return res.status(404).json({
        success: false,
        message: 'Course rep not found or you are not the assigned rep'
      });
    }
    
    // Find the chat
    let chat = await CourseRepChat.findOne({
      courseRep: repId,
      isActive: true
    });
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }
    
    // Handle file attachments if any
    const attachments = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        const isImage = file.mimetype.startsWith('image/');
        const isVideo = file.mimetype.startsWith('video/');
        const isDocument = !isImage && !isVideo;
        
        attachments.push({
          url: `/uploads/course-rep-chat/${file.filename}`,
          filename: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          isImage,
          isVideo,
          isDocument
        });
      });
    }
    
    // Add the message
    const newMessage = {
      sender: req.user.id,
      senderRole: 'course_rep',
      text,
      attachments,
      read: false,
      createdAt: new Date()
    };
    
    chat.messages.push(newMessage);
    
    // Update lastMessage
    chat.lastMessage = {
      text,
      sender: req.user.id,
      timestamp: new Date(),
      read: false
    };
    
    await chat.save();
    
    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
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