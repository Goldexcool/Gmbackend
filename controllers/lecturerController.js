// controllers/lecturerController.js
const Lecturer = require('../models/Lecturer');
const Course = require('../models/Course');
const Student = require('../models/Student');
const User = require('../models/User');
const Schedule = require('../models/Schedule');
const Task = require('../models/Task');
const Chat = require('../models/Chat');
const { bucket } = require('../config/firebase');


exports.setSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, courseId, time, venue } = req.body;
    
    // Validate lecturer ID
    if (id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this schedule'
      });
    }

    // Validate input
    if (!date || !courseId || !time || !venue) {
      return res.status(400).json({
        success: false,
        message: 'Please provide date, course, time and venue'
      });
    }

    // Check if lecturer teaches this course
    const course = await Course.findById(courseId);
    if (!course || !course.assignedLecturers.includes(id)) {
      return res.status(400).json({
        success: false,
        message: 'You are not assigned to this course'
      });
    }

    // Create or update schedule entry
    const scheduleEntry = await Schedule.findOneAndUpdate(
      { course: courseId, date: new Date(date) },
      { time, venue, lecturer: id },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      data: scheduleEntry
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};


exports.createTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, dueDate, priority, description } = req.body;
    
    // Validate lecturer ID
    if (id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create tasks for this user'
      });
    }

    // Validate input
    if (!name || !dueDate) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name and due date'
      });
    }

    // Create task
    const task = await Task.create({
      user: id,
      name,
      dueDate,
      priority: priority || 'medium',
      description,
      status: 'pending'
    });

    res.status(201).json({
      success: true,
      data: task
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};


exports.updateTask = async (req, res) => {
  try {
    const { id, taskId } = req.params;
    const { status, name, dueDate, priority, description } = req.body;
    
    // Validate lecturer ID
    if (id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this task'
      });
    }

    // Find task
    let task = await Task.findById(taskId);
    
    // Check if task exists
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // Check task ownership
    if (task.user.toString() !== id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this task'
      });
    }

    // Update task fields
    if (status) task.status = status;
    if (name) task.name = name;
    if (dueDate) task.dueDate = dueDate;
    if (priority) task.priority = priority;
    if (description) task.description = description;

    await task.save();

    res.status(200).json({
      success: true,
      data: task
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.getStudents = async (req, res) => {
  try {
    const { id } = req.params;
    const { courseId } = req.query;
    
    // Validate lecturer ID
    if (id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view these students'
      });
    }

    let students = [];
    
    if (courseId) {
      // Get students for specific course
      const course = await Course.findById(courseId);
      
      if (!course) {
        return res.status(404).json({
          success: false,
          message: 'Course not found'
        });
      }
      
      // Verify lecturer teaches this course
      if (!course.assignedLecturers.includes(id)) {
        return res.status(403).json({
          success: false,
          message: 'You are not assigned to this course'
        });
      }
      
      // Get students enrolled in this course
      students = await Student.find({
        _id: { $in: course.enrolledStudents }
      }).populate('user', 'fullName email avatar');
      
    } else {
      // Get all students for courses taught by lecturer
      const courses = await Course.find({
        assignedLecturers: id
      });
      
      const studentIds = [];
      courses.forEach(course => {
        course.enrolledStudents.forEach(studentId => {
          if (!studentIds.includes(studentId.toString())) {
            studentIds.push(studentId.toString());
          }
        });
      });
      
      students = await Student.find({
        _id: { $in: studentIds }
      }).populate('user', 'fullName email avatar');
    }

    res.status(200).json({
      success: true,
      count: students.length,
      data: students
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.assignCourseRep = async (req, res) => {
  try {
    const { id } = req.params;
    const { studentId, courseId } = req.body;
    
    // Validate lecturer ID
    if (id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to assign course rep'
      });
    }

    // Validate input
    if (!studentId || !courseId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both student and course IDs'
      });
    }

    // Find course
    const course = await Course.findById(courseId);
    
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Check if lecturer teaches this course
    if (!course.assignedLecturers.includes(id)) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this course'
      });
    }
    
    // Check if student is enrolled in course
    if (!course.enrolledStudents.includes(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'This student is not enrolled in the course'
      });
    }
    
    // Update course rep
    course.courseRep = studentId;
    await course.save();

    res.status(200).json({
      success: true,
      data: course
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.getLecturerProfile = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Anyone can view lecturer profiles, but detailed info only for self or admin
    const isAuthorized = req.user.id === id || req.user.role === 'admin';

    const lecturer = await Lecturer.findOne({ user: id })
      .populate('user', 'fullName email avatar')
      .populate({
        path: 'courses',
        select: 'name code schedule',
        populate: {
          path: 'schedule',
          select: 'date time venue'
        }
      });
      
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer not found'
      });
    }

    // If not authorized, return limited info
    if (!isAuthorized) {
      const limitedInfo = {
        fullName: lecturer.user.fullName,
        email: lecturer.user.email,
        avatar: lecturer.user.avatar,
        department: lecturer.department,
        college: lecturer.college,
        courses: lecturer.courses.map(course => ({
          name: course.name,
          code: course.code
        }))
      };
      
      return res.status(200).json({
        success: true,
        data: limitedInfo
      });
    }

    res.status(200).json({
      success: true,
      data: lecturer
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.chatWithStudent = async (req, res) => {
  try {
    const { studentId, message } = req.body;
    
    // Check if user is a lecturer
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    
    if (!lecturer) {
      return res.status(403).json({
        success: false,
        message: 'Only lecturers can use this feature'
      });
    }
    
    // Check if student exists
    const student = await Student.findOne({ user: studentId });
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }
    
    // Check if there's a course in common
    let hasCommonCourse = false;
    
    for (const courseId of lecturer.courses) {
      if (student.courses.includes(courseId)) {
        hasCommonCourse = true;
        break;
      }
    }
    
    if (!hasCommonCourse) {
      return res.status(403).json({
        success: false,
        message: 'No common courses with this student'
      });
    }
    
    // Find or create chat
    let chat = await Chat.findOne({
      participants: { $all: [req.user.id, studentId] }
    });
    
    if (!chat) {
      chat = await Chat.create({
        participants: [req.user.id, studentId],
        messages: []
      });
    }
    
    // Add message to chat
    chat.messages.push({
      sender: req.user.id,
      content: message
    });
    
    // Update last message
    chat.lastMessage = {
      content: message,
      sender: req.user.id,
      timestamp: new Date()
    };
    
    await chat.save();

    res.status(200).json({
      success: true,
      data: chat
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};