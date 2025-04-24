// controllers/studentController.js
const Student = require('../models/Student');
const User = require('../models/User');
const Task = require('../models/Task');
const Schedule = require('../models/Schedule');
const StudyGroup = require('../models/StudyGroup');
const Chat = require('../models/Chat');

// @desc    Get student dashboard data
// @route   GET /api/students/:id/dashboard
// @access  Private
exports.getDashboard = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user is authorized
    if (req.user.role !== 'admin' && req.user.id !== id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this dashboard'
      });
    }

    const student = await Student.findOne({ user: id })
      .populate('user', 'fullName email avatar')
      .populate('courses');
      
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Get upcoming tasks
    const tasks = await Task.find({
      user: id,
      status: { $ne: 'completed' },
      dueDate: { $gte: new Date() }
    }).sort('dueDate');

    // Get upcoming schedule
    const schedule = await Schedule.find({
      course: { $in: student.courses },
      date: { $gte: new Date() }
    })
    .populate('course', 'name code')
    .sort('date startTime')
    .limit(5);
    
    // Get study groups
    const studyGroups = await StudyGroup.find({
      members: id
    })
    .populate('course', 'name code')
    .limit(5);

    res.status(200).json({
      success: true,
      data: {
        student,
        tasks,
        schedule,
        studyGroups
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get student schedule
// @route   GET /api/students/:id/schedule
// @access  Private
exports.getSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user is authorized
    if (req.user.role !== 'admin' && req.user.id !== id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this schedule'
      });
    }

    const student = await Student.findOne({ user: id });
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const schedule = await Schedule.find({
      course: { $in: student.courses }
    })
    .populate('course', 'name code')
    .sort('date startTime');

    res.status(200).json({
      success: true,
      data: schedule
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create task for student
// @route   POST /api/students/:id/tasks
// @access  Private
exports.createTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, dueDate, courseId } = req.body;
    
    // Check if user is authorized
    if (req.user.id !== id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create tasks for this user'
      });
    }

    const task = await Task.create({
      user: id,
      name,
      dueDate,
      course: courseId || null
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

// @desc    Update task status (complete/reopen)
// @route   PUT /api/students/:id/tasks/:taskId
// @access  Private
exports.updateTask = async (req, res) => {
  try {
    const { id, taskId } = req.params;
    const { status } = req.body;
    
    // Check if user is authorized
    if (req.user.id !== id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this task'
      });
    }

    const task = await Task.findOne({ _id: taskId, user: id });
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // Update task status
    task.status = status;
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

// @desc    Connect with another student
// @route   POST /api/chat/connect
// @access  Private
exports.connectWithStudent = async (req, res) => {
  try {
    const { studentId } = req.body;
    
    // Check if target student exists
    const targetStudent = await Student.findOne({ user: studentId });
    
    if (!targetStudent) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }
    
    // Check if current user is a student
    const currentStudent = await Student.findOne({ user: req.user.id });
    
    if (!currentStudent) {
      return res.status(403).json({
        success: false,
        message: 'Only students can connect with other students'
      });
    }
    
    // Check if already connected
    if (currentStudent.connections.includes(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Already connected with this student'
      });
    }
    
    // Add to connections for both students
    currentStudent.connections.push(studentId);
    await currentStudent.save();
    
    targetStudent.connections.push(req.user.id);
    await targetStudent.save();
    
    // Create a chat between them if not exists
    let chat = await Chat.findOne({
      participants: { $all: [req.user.id, studentId] }
    });
    
    if (!chat) {
      chat = await Chat.create({
        participants: [req.user.id, studentId],
        messages: []
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        chatId: chat._id,
        message: 'Successfully connected with student'
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create study group
// @route   POST /api/study-groups
// @access  Private
exports.createStudyGroup = async (req, res) => {
  try {
    const { title, description, courseId, isPublic, memberIds } = req.body;
    
    // Create chat for study group
    const chat = await Chat.create({
      participants: [req.user.id, ...memberIds],
      messages: []
    });
    
    // Create study group
    const studyGroup = await StudyGroup.create({
      title,
      description,
      creator: req.user.id,
      members: [req.user.id, ...memberIds],
      course: courseId,
      isPublic,
      chat: chat._id
    });
    
    // Add study group to each student
    const studentPromises = [req.user.id, ...memberIds].map(userId => {
      return Student.findOneAndUpdate(
        { user: userId },
        { $push: { studyGroups: studyGroup._id } }
      );
    });
    
    await Promise.all(studentPromises);
    
    res.status(201).json({
      success: true,
      data: studyGroup
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get student profile
// @route   GET /api/students/:id
// @access  Private
exports.getStudentProfile = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user is authorized
    if (req.user.role !== 'admin' && req.user.id !== id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this profile'
      });
    }

    const student = await Student.findOne({ user: id })
      .populate('user', 'fullName email avatar')
      .populate('courses', 'name code')
      .populate('connections', 'user');
      
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    res.status(200).json({
      success: true,
      data: student
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};