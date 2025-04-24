// controllers/adminController.js
const User = require('../models/User');
const Lecturer = require('../models/Lecturer');
const Student = require('../models/Student');
const Course = require('../models/Course');
const Schedule = require('../models/Schedule');

// @desc    Assign course to lecturer
// @route   POST /api/admin/assign-course
// @access  Private (Admin only)
exports.assignCourse = async (req, res) => {
  try {
    const { lecturerId, courseId } = req.body;
    
    // Validate input
    if (!lecturerId || !courseId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both lecturer and course IDs'
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

    // Check if lecturer exists
    const lecturer = await Lecturer.findOne({ user: lecturerId });
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer not found'
      });
    }

    // Add lecturer to course if not already assigned
    if (!course.assignedLecturers.includes(lecturerId)) {
      course.assignedLecturers.push(lecturerId);
      await course.save();
    }

    // Add course to lecturer if not already included
    if (!lecturer.courses.includes(courseId)) {
      lecturer.courses.push(courseId);
      await lecturer.save();
    }

    res.status(200).json({
      success: true,
      message: 'Course assigned successfully',
      data: { course, lecturer }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Send global notification
// @route   POST /api/admin/notify
// @access  Private (Admin only)
exports.sendNotification = async (req, res) => {
  try {
    const { title, message, targetRoles = ['student', 'lecturer'] } = req.body;
    
    // Validate input
    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both title and message'
      });
    }

    // Find users based on target roles
    const users = await User.find({ role: { $in: targetRoles } });
    
    // In a real application, you would send notifications to users
    // through FCM, email, or in-app notification system
    
    // For now, we'll just simulate the notification
    const notification = {
      title,
      message,
      sentBy: req.user.id,
      sentAt: new Date(),
      recipients: users.map(user => user._id)
    };

    res.status(200).json({
      success: true,
      message: `Notification sent to ${users.length} users`,
      data: notification
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private (Admin only)
exports.getAllUsers = async (req, res) => {
  try {
    const { role } = req.query;
    let query = {};
    
    if (role) {
      query.role = role;
    }
    
    const users = await User.find(query)
      .select('-password')
      .sort('fullName');

    res.status(200).json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Set global schedule entries
// @route   POST /api/admin/schedule
// @access  Private (Admin only)
exports.setGlobalSchedule = async (req, res) => {
  try {
    const { 
      courseId, 
      lecturerId, 
      date, 
      time, 
      venue, 
      isRecurring, 
      recurringDays 
    } = req.body;
    
    // Validate input
    if (!courseId || !lecturerId || !date || !time || !venue) {
      return res.status(400).json({
        success: false,
        message: 'Please provide course, lecturer, date, time, and venue'
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

    // Check if lecturer exists
    const lecturer = await Lecturer.findOne({ user: lecturerId });
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer not found'
      });
    }

    // Check if lecturer is assigned to the course
    if (!course.assignedLecturers.includes(lecturerId)) {
      return res.status(400).json({
        success: false,
        message: 'This lecturer is not assigned to the course'
      });
    }

    let scheduleEntries = [];
    
    if (isRecurring && recurringDays && recurringDays.length > 0) {
      // Create recurring schedule entries
      const startDate = new Date(date);
      
      // Create entries for the next 3 months
      for (let i = 0; i < 12; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + (7 * i));
        
        for (const day of recurringDays) {
          const dayOffset = day - currentDate.getDay();
          const scheduleDate = new Date(currentDate);
          scheduleDate.setDate(currentDate.getDate() + dayOffset);
          
          const entry = await Schedule.create({
            course: courseId,
            lecturer: lecturerId,
            date: scheduleDate,
            time,
            venue
          });
          
          scheduleEntries.push(entry);
        }
      }
    } else {
      // Create a single schedule entry
      const entry = await Schedule.create({
        course: courseId,
        lecturer: lecturerId,
        date: new Date(date),
        time,
        venue
      });
      
      scheduleEntries.push(entry);
    }

    res.status(201).json({
      success: true,
      count: scheduleEntries.length,
      data: scheduleEntries
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get admin dashboard
// @route   GET /api/admin/dashboard
// @access  Private (Admin only)
exports.getAdminDashboard = async (req, res) => {
  try {
    // Get counts of various entities
    const studentsCount = await User.countDocuments({ role: 'student' });
    const lecturersCount = await User.countDocuments({ role: 'lecturer' });
    const coursesCount = await Course.countDocuments();
    
    // Get recent users
    const recentUsers = await User.find()
      .select('-password')
      .sort('-createdAt')
      .limit(5);
      
    // Get upcoming schedule entries
    const today = new Date();
    const upcomingSchedules = await Schedule.find({
      date: { $gte: today }
    })
    .populate('course', 'name code')
    .populate({
      path: 'lecturer',
      select: 'user',
      populate: {
        path: 'user',
        select: 'fullName'
      }
    })
    .sort('date')
    .limit(5);
    
    res.status(200).json({
      success: true,
      data: {
        counts: {
          students: studentsCount,
          lecturers: lecturersCount,
          courses: coursesCount
        },
        recentUsers,
        upcomingSchedules
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