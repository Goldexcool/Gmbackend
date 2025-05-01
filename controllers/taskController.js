const Task = require('../models/Task');
const Student = require('../models/Student');
const Course = require('../models/Course');
const Assignment = require('../models/Assignment');

// ==================== TASK CRUD OPERATIONS ====================

// @desc    Create a new task
// @route   POST /api/student/tasks
// @access  Private/Student
exports.createTask = async (req, res) => {
  try {
    const {
      title,
      description,
      dueDate,
      priority,
      category,
      relatedCourse,
      relatedAssignment,
      reminderDate,
      notes,
      color
    } = req.body;
    
    // Validate required fields
    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a title for the task'
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
    
    // Validate course if provided
    if (relatedCourse) {
      const course = await Course.findById(relatedCourse);
      if (!course) {
        return res.status(404).json({
          success: false,
          message: 'Related course not found'
        });
      }
      
      // Check if student is enrolled in this course
      const isEnrolled = student.courses.some(c => c.toString() === relatedCourse);
      if (!isEnrolled) {
        return res.status(403).json({
          success: false,
          message: 'You are not enrolled in this course'
        });
      }
    }
    
    // Validate assignment if provided
    if (relatedAssignment) {
      const assignment = await Assignment.findById(relatedAssignment);
      if (!assignment) {
        return res.status(404).json({
          success: false,
          message: 'Related assignment not found'
        });
      }
    }
    
    // Create task
    const task = new Task({
      title,
      description,
      dueDate: dueDate ? new Date(dueDate) : null,
      priority: priority || 'medium',
      category: category || 'academic',
      relatedCourse,
      relatedAssignment,
      student: student._id,
      reminderDate: reminderDate ? new Date(reminderDate) : null,
      notes,
      color
    });
    
    await task.save();
    
    res.status(201).json({
      success: true,
      data: task
    });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating task',
      error: error.message
    });
  }
};

// @desc    Get all tasks for a student
// @route   GET /api/student/tasks
// @access  Private/Student
exports.getTasks = async (req, res) => {
  try {
    const { status, priority, category, course, dueDate } = req.query;
    
    // Get student profile
    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }
    
    // Build query
    const query = { student: student._id };
    
    // Add optional filters
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (category) query.category = category;
    if (course) query.relatedCourse = course;
    
    // Filter by due date if provided
    if (dueDate === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      query.dueDate = { $gte: today, $lt: tomorrow };
    } else if (dueDate === 'week') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);
      
      query.dueDate = { $gte: today, $lt: nextWeek };
    } else if (dueDate === 'overdue') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      query.dueDate = { $lt: today };
      query.status = { $ne: 'completed' };
    }
    
    // Find tasks
    const tasks = await Task.find(query)
      .populate('relatedCourse', 'code title')
      .populate('relatedAssignment', 'title dueDate')
      .sort({ dueDate: 1, priority: -1, createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: tasks.length,
      data: tasks
    });
  } catch (error) {
    console.error('Error getting tasks:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting tasks',
      error: error.message
    });
  }
};

// @desc    Get a task
// @route   GET /api/student/tasks/:id
// @access  Private/Student
exports.getTask = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get student profile
    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }
    
    // Find task
    const task = await Task.findOne({
      _id: id,
      student: student._id
    })
    .populate('relatedCourse', 'code title')
    .populate('relatedAssignment', 'title dueDate');
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found or you are not authorized to view it'
      });
    }
    
    res.status(200).json({
      success: true,
      data: task
    });
  } catch (error) {
    console.error('Error getting task:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting task',
      error: error.message
    });
  }
};

// @desc    Update task
// @route   PUT /api/student/tasks/:id
// @access  Private/Student
exports.updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      dueDate,
      priority,
      status,
      category,
      relatedCourse,
      relatedAssignment,
      reminderDate,
      notes,
      color,
      completedAt
    } = req.body;
    
    // Get student profile
    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }
    
    // Find task
    const task = await Task.findOne({
      _id: id,
      student: student._id
    });
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found or you are not authorized to update it'
      });
    }
    
    // Update task fields if provided
    if (title !== undefined) task.title = title;
    if (description !== undefined) task.description = description;
    if (dueDate !== undefined) task.dueDate = dueDate ? new Date(dueDate) : null;
    if (priority !== undefined) task.priority = priority;
    if (status !== undefined) task.status = status;
    if (category !== undefined) task.category = category;
    if (relatedCourse !== undefined) task.relatedCourse = relatedCourse || null;
    if (relatedAssignment !== undefined) task.relatedAssignment = relatedAssignment || null;
    if (reminderDate !== undefined) task.reminderDate = reminderDate ? new Date(reminderDate) : null;
    if (notes !== undefined) task.notes = notes;
    if (color !== undefined) task.color = color;
    
    // Set completed date if task is marked as completed
    if (status === 'completed' && !task.completedAt) {
      task.completedAt = completedAt || new Date();
    } else if (status !== 'completed') {
      task.completedAt = null;
    }
    
    await task.save();
    
    res.status(200).json({
      success: true,
      data: task
    });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating task',
      error: error.message
    });
  }
};

// @desc    Delete task
// @route   DELETE /api/student/tasks/:id
// @access  Private/Student
exports.deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get student profile
    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }
    
    // Find and delete task
    const task = await Task.findOneAndDelete({
      _id: id,
      student: student._id
    });
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found or you are not authorized to delete it'
      });
    }
    
    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting task',
      error: error.message
    });
  }
};

// @desc    Mark task as complete/incomplete
// @route   PUT /api/student/tasks/:id/toggle-status
// @access  Private/Student
exports.toggleTaskStatus = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get student profile
    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }
    
    // Find task
    const task = await Task.findOne({
      _id: id,
      student: student._id
    });
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found or you are not authorized to update it'
      });
    }
    
    // Toggle status
    if (task.status === 'completed') {
      task.status = 'pending';
      task.completedAt = null;
    } else {
      task.status = 'completed';
      task.completedAt = new Date();
    }
    
    await task.save();
    
    res.status(200).json({
      success: true,
      data: task
    });
  } catch (error) {
    console.error('Error toggling task status:', error);
    res.status(500).json({
      success: false,
      message: 'Error toggling task status',
      error: error.message
    });
  }
};