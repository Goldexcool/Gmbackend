// controllers/lecturerController.js
const Lecturer = require('../models/Lecturer');
const Course = require('../models/Course');
const Student = require('../models/Student');
const User = require('../models/User');
const path = require('path');
const fs = require('fs');

// Optional imports with fallbacks
let Schedule, Task, Chat, FAQ, Department, bucket;

// Import Department model with fallback
try {
  Department = require('../models/Department');
} catch (error) {
  console.warn('Department model not found:', error.message);
  // Create a stub model to prevent crashes
  Department = { findById: () => Promise.resolve(null) };
}

// Import other optional models with fallbacks
try {
  Schedule = require('../models/Schedule');
} catch (error) {
  console.warn('Schedule model not found:', error.message);
  Schedule = { findOneAndUpdate: () => Promise.resolve(null) };
}

try {
  Task = require('../models/Task');
} catch (error) {
  console.warn('Task model not found:', error.message);
  Task = { create: () => Promise.resolve(null), findById: () => Promise.resolve(null) };
}

try {
  Chat = require('../models/Chat');
} catch (error) {
  console.warn('Chat model not found:', error.message);
  Chat = { findOne: () => Promise.resolve(null), create: () => Promise.resolve(null) };
}

try {
  FAQ = require('../models/FAQ');
} catch (error) {
  console.warn('FAQ model not found:', error.message);
  FAQ = { find: () => Promise.resolve([]) };
}

// Import Firebase with fallback
try {
  const firebase = require('../config/firebase');
  bucket = firebase.bucket;
} catch (error) {
  console.warn('Firebase config not found:', error.message);
  // Create dummy bucket to prevent crashes
  bucket = {
    upload: () => Promise.resolve({ publicUrl: () => "" }),
    file: () => ({ delete: () => Promise.resolve() })
  };
}

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

/**
 * @desc    Get all tasks for lecturer
 * @route   GET /api/lecturer/tasks
 * @access  Private/Lecturer
 */
exports.getTasks = async (req, res) => {
  try {
    const { courseId, status } = req.query;
    
    // Get the lecturer profile
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found'
      });
    }
    
    // Build the query
    const query = {
      $or: [
        { createdBy: req.user.id },
        { assignedTo: { $in: lecturer.courses } }
      ]
    };
    
    // Add filters if provided
    if (courseId) {
      query.course = courseId;
    }
    
    if (status) {
      query.status = status;
    }
    
    // Get all tasks
    const tasks = await Task.find(query)
      .populate('course', 'code title')
      .populate('createdBy', 'fullName email profilePicture')
      .sort({ createdAt: -1 });
    
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

/**
 * @desc    Get task details
 * @route   GET /api/lecturer/tasks/:id
 * @access  Private/Lecturer
 */
exports.getTaskDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get the task with all related data
    const task = await Task.findById(id)
      .populate('course', 'code title')
      .populate('createdBy', 'fullName email profilePicture')
      .populate({
        path: 'comments',
        populate: {
          path: 'user',
          select: 'fullName email profilePicture role'
        }
      });
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: task
    });
  } catch (error) {
    console.error('Error getting task details:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting task details',
      error: error.message
    });
  }
};

/**
 * @desc    Create a new task
 * @route   POST /api/lecturer/tasks
 * @access  Private/Lecturer
 */
exports.createTask = async (req, res) => {
  try {
    const { 
      title, 
      description, 
      courseId, 
      dueDate, 
      priority = 'medium',
      status = 'open',
      visibleToStudents = true
    } = req.body;
    
    // Validate required fields
    if (!title || !courseId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title and course'
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
    
    // Verify that this lecturer teaches this course
    const lecturerCourses = lecturer.courses.map(id => id.toString());
    if (!lecturerCourses.includes(courseId)) {
      return res.status(403).json({
        success: false,
        message: 'You can only create tasks for courses you teach'
      });
    }
    
    // Process uploaded files
    const files = req.files || [];
    const attachments = files.map(file => ({
      filename: file.filename,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path
    }));
    
    // Get all students enrolled in this course
    const enrolledStudents = await Student.find({ courses: courseId });
    const studentIds = enrolledStudents.map(student => student._id);
    
    // Create the task
    const task = await Task.create({
      title,
      description,
      course: courseId,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      priority,
      status,
      attachments,
      createdBy: req.user.id,
      visibleToStudents,
      assignedTo: studentIds
    });
    
    // Add task to course
    await Course.findByIdAndUpdate(
      courseId,
      { $push: { tasks: task._id } }
    );
    
    // If visible to students, create notifications
    if (visibleToStudents) {
      // Get course details
      const course = await Course.findById(courseId);
      
      // Get all students enrolled in this course
      const enrolledStudents = await Student.find({ courses: courseId });
      
      // Create notifications
      const notifications = enrolledStudents.map(student => ({
        recipient: student.user,
        type: 'task',
        message: `New task "${title}" posted in ${course ? course.code : 'your course'}`,
        referenceId: task._id,
        referenceModel: 'Task'
      }));
      
      if (notifications.length > 0) {
        await Notification.insertMany(notifications);
      }
    }
    
    // Return the created task
    const populatedTask = await Task.findById(task._id)
      .populate('course', 'code title')
      .populate('createdBy', 'fullName email profilePicture');
    
    res.status(201).json({
      success: true,
      data: populatedTask
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

/**
 * @desc    Update a task
 * @route   PUT /api/lecturer/tasks/:id
 * @access  Private/Lecturer
 */
exports.updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, 
      description, 
      dueDate, 
      priority,
      status,
      visibleToStudents,
      removeAttachments = []
    } = req.body;
    
    // Find the task
    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    
    // Check authorization - only creator or course lecturer can update
    if (task.createdBy.toString() !== req.user.id) {
      const lecturer = await Lecturer.findOne({ user: req.user.id });
      if (!lecturer) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update this task'
        });
      }
      
      const lecturerCourses = lecturer.courses.map(id => id.toString());
      if (!lecturerCourses.includes(task.course.toString())) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update this task'
        });
      }
    }
    
    // Process uploaded files
    const files = req.files || [];
    const newAttachments = files.map(file => ({
      filename: file.filename,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path
    }));
    
    // Filter out attachments that should be removed
    let existingAttachments = task.attachments || [];
    if (removeAttachments && removeAttachments.length > 0) {
      existingAttachments = existingAttachments.filter(
        attachment => !removeAttachments.includes(attachment.filename)
      );
    }
    
    // Build update object
    const updateData = {
      title: title || task.title,
      description: description || task.description,
      dueDate: dueDate ? new Date(dueDate) : task.dueDate,
      priority: priority || task.priority,
      status: status || task.status,
      attachments: [...existingAttachments, ...newAttachments],
      visibleToStudents: visibleToStudents !== undefined ? visibleToStudents : task.visibleToStudents,
      updatedAt: Date.now()
    };
    
    // Update the task
    const updatedTask = await Task.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    ).populate('course', 'code title')
     .populate('createdBy', 'fullName email profilePicture');
    
    // Create notifications for status changes
    if (status && status !== task.status) {
      // Get course details
      const course = await Course.findById(task.course);
      
      // If status changed to 'completed', notify students
      if (status === 'completed' && task.visibleToStudents) {
        const enrolledStudents = await Student.find({ courses: task.course });
        
        const notifications = enrolledStudents.map(student => ({
          recipient: student.user,
          type: 'task_update',
          message: `Task "${task.title}" in ${course ? course.code : 'your course'} has been completed`,
          referenceId: task._id,
          referenceModel: 'Task'
        }));
        
        if (notifications.length > 0) {
          await Notification.insertMany(notifications);
        }
      }
    }
    
    res.status(200).json({
      success: true,
      data: updatedTask
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

/**
 * @desc    Delete a task
 * @route   DELETE /api/lecturer/tasks/:id
 * @access  Private/Lecturer
 */
exports.deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the task
    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    
    // Check authorization - only creator can delete
    if (task.createdBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this task'
      });
    }
    
    // Remove task from course
    await Course.findByIdAndUpdate(
      task.course,
      { $pull: { tasks: task._id } }
    );
    
    // Delete task
    await Task.findByIdAndDelete(id);
    
    res.status(200).json({
      success: true,
      message: 'Task deleted successfully'
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

// @desc    Get all FAQs for lecturers
// @route   GET /api/lecturers/faqs
// @access  Private (Lecturer only)
exports.getAllFAQs = async (req, res) => {
  try {
    // Import FAQ model if not already imported
    const FAQ = require('../models/FAQ');
    
    // Only get active FAQs
    const faqs = await FAQ.find({ isActive: true })
      .sort({ category: 1, order: 1 });
    
    res.status(200).json({
      success: true,
      count: faqs.length,
      data: faqs
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get all departments for lecturers
// @route   GET /api/lecturers/departments
// @access  Private (Lecturer only)
exports.getDepartments = async (req, res) => {
  try {
    // Get unique departments from courses
    const departments = await Course.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$department', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $match: { _id: { $ne: null } } }
    ]);
    
    res.status(200).json({
      success: true,
      count: departments.length,
      data: departments.map(dept => ({ 
        name: dept._id,
        courseCount: dept.count
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get department details for lecturers
// @route   GET /api/lecturers/departments/:departmentName
// @access  Private (Lecturer only)
exports.getDepartmentDetails = async (req, res) => {
  try {
    const { departmentName } = req.params;
    
    // Get lecturer's ID
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    
    // Get courses for the department
    const courses = await Course.find({ 
      department: departmentName 
    }).select('name code credits description semester level');
    
    if (courses.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Department '${departmentName}' not found or has no courses`
      });
    }
    
    // Get lecturers for the department
    const lecturers = await Lecturer.find({ 
      department: departmentName 
    }).populate('user', 'fullName email');
    
    // Mark courses taught by the requesting lecturer
    const coursesWithAssignment = courses.map(course => {
      const courseObj = course.toObject();
      if (lecturer && lecturer.courses && lecturer.courses.includes(course._id)) {
        courseObj.isTeaching = true;
      } else {
        courseObj.isTeaching = false;
      }
      return courseObj;
    });
    
    res.status(200).json({
      success: true,
      data: {
        name: departmentName,
        courses: coursesWithAssignment,
        lecturers: lecturers.map(l => ({
          id: l._id,
          name: l.user.fullName,
          email: l.user.email
        })),
        stats: {
          courseCount: courses.length,
          lecturerCount: lecturers.length
        }
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * @desc    Update lecturer profile
 * @route   PUT /api/lecturer/profile
 * @access  Private/Lecturer
 */
exports.updateLecturerProfile = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phoneNumber,
      department,
      staffId,
      title,
      specialization,
      bio,
      research,
      officeHours,
      officeLocation,
      website,
      socialLinks
    } = req.body;

    // Find lecturer profile by user ID
    const lecturer = await Lecturer.findOne({ user: req.user.id });

    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found'
      });
    }

    // Get the associated user record to update basic info
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update user name if provided
    if (firstName || lastName) {
      if (firstName) user.firstName = firstName;
      if (lastName) user.lastName = lastName;
      
      // Update the full name field
      user.name = `${firstName || user.firstName} ${lastName || user.lastName}`;
      
      await user.save();
    }

    // Update lecturer profile fields if provided
    if (phoneNumber !== undefined) lecturer.phoneNumber = phoneNumber;
    if (title !== undefined) lecturer.title = title;
    if (specialization !== undefined) lecturer.specialization = specialization;
    if (bio !== undefined) lecturer.bio = bio;
    if (research !== undefined) lecturer.research = research;
    if (officeHours !== undefined) lecturer.officeHours = officeHours;
    if (officeLocation !== undefined) lecturer.officeLocation = officeLocation;
    if (website !== undefined) lecturer.website = website;
    
    // Update social links if provided
    if (socialLinks) {
      lecturer.socialLinks = {
        ...lecturer.socialLinks || {},
        ...socialLinks
      };
    }

    // Special handling for department and staffId changes - might require approval
    const updatesRequiringApproval = {};
    let requiresApproval = false;

    if (department && department !== lecturer.department) {
      updatesRequiringApproval.department = department;
      requiresApproval = true;
    }

    if (staffId && staffId !== lecturer.staffId) {
      updatesRequiringApproval.staffId = staffId;
      requiresApproval = true;
    }

    // If updates require approval, store them separately
    if (requiresApproval) {
      lecturer.pendingUpdates = {
        ...lecturer.pendingUpdates || {},
        ...updatesRequiringApproval,
        requestedAt: new Date(),
        status: 'pending'
      };
    } else {
      // If no approval needed, apply updates directly
      if (department) lecturer.department = department;
      if (staffId) lecturer.staffId = staffId;
    }

    // Handle profile picture upload if included
    if (req.file) {
      // Delete old profile picture if exists
      if (lecturer.profilePicture && lecturer.profilePicture.fileUrl) {
        const oldFilePath = path.join(__dirname, '..', lecturer.profilePicture.fileUrl);
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      }

      lecturer.profilePicture = {
        filename: req.file.originalname,
        fileUrl: `/uploads/profiles/${req.file.filename}`,
        mimeType: req.file.mimetype,
        size: req.file.size
      };
    }

    // Save updated lecturer profile
    await lecturer.save();

    // Return updated profile with populated fields
    const updatedLecturer = await Lecturer.findById(lecturer._id)
      .populate('user', 'name email')
      .populate('department', 'name code');

    res.status(200).json({
      success: true,
      message: requiresApproval 
        ? 'Profile updated. Some changes require approval and are pending review.' 
        : 'Profile updated successfully',
      data: updatedLecturer,
      pendingChanges: requiresApproval ? updatesRequiringApproval : null
    });
  } catch (error) {
    console.error('Error updating lecturer profile:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating lecturer profile',
      error: error.message
    });
  }
};

/**
 * @desc    Get lecturer's assignment
 * @route   GET /api/lecturer/assignments/:id
 * @access  Private/Lecturer
 */
exports.getLecturerAssignment = async (req, res) => {
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
    
    // Find assignment
    const Assignment = require('../models/Assignment');
    const assignment = await Assignment.findOne({
      _id: id,
      lecturer: lecturer._id
    })
    .populate('course', 'code title department level')
    .populate('academicSession', 'name year');
    
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found or you do not have permission to view it'
      });
    }
    
    // Get submission statistics
    const submissionCount = assignment.submissions.length;
    const gradedCount = assignment.submissions.filter(sub => sub.status === 'graded').length;
    
    // Get list of students who haven't submitted yet
    const Student = require('../models/Student');
    const enrolledStudents = await Student.find({
      courses: assignment.course._id
    })
    .populate('user', 'name email');
    
    const submittedStudentIds = assignment.submissions.map(sub => sub.student.toString());
    const nonSubmitters = enrolledStudents.filter(student => 
      !submittedStudentIds.includes(student._id.toString())
    ).map(student => ({
      _id: student._id,
      name: student.user.name,
      email: student.user.email,
      matricNumber: student.matricNumber
    }));
    
    // Include submission details with student info
    const populatedSubmissions = await Promise.all(assignment.submissions.map(async (sub) => {
      const student = await Student.findById(sub.student).populate('user', 'name email');
      return {
        ...sub.toObject(),
        studentName: student?.user?.name || 'Unknown',
        studentEmail: student?.user?.email || 'Unknown',
        matricNumber: student?.matricNumber || 'Unknown'
      };
    }));
    
    // Create response with detailed information
    const assignmentDetails = {
      ...assignment.toObject(),
      submissions: populatedSubmissions,
      stats: {
        totalEnrolled: enrolledStudents.length,
        totalSubmitted: submissionCount,
        totalGraded: gradedCount,
        submissionRate: enrolledStudents.length ? (submissionCount / enrolledStudents.length) * 100 : 0
      },
      nonSubmitters
    };
    
    res.status(200).json({
      success: true,
      data: assignmentDetails
    });
  } catch (error) {
    console.error('Error getting lecturer assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting lecturer assignment',
      error: error.message
    });
  }
};