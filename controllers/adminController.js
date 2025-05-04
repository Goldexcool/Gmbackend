// controllers/adminController.js
const mongoose = require('mongoose');
const User = require('../models/User');
const Student = require('../models/Student');
const Lecturer = require('../models/Lecturer');
const Department = require('../models/Department');
const Course = require('../models/Course');
const AcademicSession = require('../models/AcademicSession');
const Enrollment = require('../models/Enrollment');
const Schedule = require('../models/Schedule');
const Announcement = require('../models/Announcement');
const FAQ = require('../models/FAQ');
const Settings = require('../models/Settings');
const ExamTimetable = require('../models/ExamTimetable');
const bcrypt = require('bcryptjs');
const SystemActivity = require('../models/SystemActivity')
// const mongoose = require('mongoose');


/**
 * @desc    Set global schedule settings
 * @route   POST /api/admin/schedule
 * @access  Private/Admin
exports.setGlobalSchedule = async (req, res) => {
  try {
    const {
      startTime,
      endTime,
      breakTime,
      classDuration,
      breakDuration,
      weekdays
    } = req.body;
    
    // Find settings or create if not exists
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings();
    }
    
    // Update schedule settings
    settings.scheduleSettings = {
      startTime: startTime || '08:00',
      endTime: endTime || '17:00',
      breakTime: breakTime || '12:00',
      classDuration: classDuration || 60,
      breakDuration: breakDuration || 30,
      weekdays: weekdays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    };
    
    await settings.save();
    
    res.status(200).json({
      success: true,
      message: 'Global schedule settings updated successfully',
      data: settings.scheduleSettings
    });
  } catch (error) {
    console.error('Error setting global schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Error setting global schedule',
      error: error.message
    });
  }
};

/**
 * @desc    Get all schedules
 * @route   GET /api/admin/schedules
 * @access  Private/Admin
 */
exports.getSchedules = async (req, res) => {
  try {
    const {
      course,
      lecturer,
      department,
      day,
      room,
      startTime,
      endTime,
      page = 1,
      limit = 20
    } = req.query;
    
    // Build query based on filters
    const query = {};
    
    if (course) query.course = course;
    if (lecturer) query.lecturer = lecturer;
    if (day) query.day = day;
    if (room) query.room = room;
    
    if (startTime) {
      query.startTime = { $gte: startTime };
    }
    
    if (endTime) {
      query.endTime = { $lte: endTime };
    }
    
    if (department) {
      // Find courses in the department
      const coursesInDept = await Course.find({ department }).select('_id');
      const courseIds = coursesInDept.map(c => c._id);
      query.course = { $in: courseIds };
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get schedules
    const schedules = await Schedule.find(query)
      .populate('course', 'code title')
      .populate({
        path: 'lecturer',
        select: 'user',
        populate: {
          path: 'user',
          select: 'fullName email'
        }
      })
      .sort({ day: 1, startTime: 1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await Schedule.countDocuments(query);
    
    res.status(200).json({
      success: true,
      count: schedules.length,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      },
      data: schedules
    });
  } catch (error) {
    console.error('Error getting schedules:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting schedules',
      error: error.message
    });
  }
};

/**
 * @desc    Create multiple schedules at once
 * @route   POST /api/admin/schedules/bulk
 * @access  Private/Admin
 */
exports.createBulkSchedules = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { schedules } = req.body;
    
    if (!schedules || !Array.isArray(schedules) || schedules.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of schedules'
      });
    }
    
    // Validate schedules
    const validationErrors = [];
    
    for (let i = 0; i < schedules.length; i++) {
      const schedule = schedules[i];
      
      // Check required fields
      if (!schedule.course) {
        validationErrors.push({
          index: i,
          error: 'Course is required'
        });
      }
      
      if (!schedule.day) {
        validationErrors.push({
          index: i,
          error: 'Day is required'
        });
      }
      
      if (!schedule.startTime) {
        validationErrors.push({
          index: i,
          error: 'Start time is required'
        });
      }
      
      if (!schedule.endTime) {
        validationErrors.push({
          index: i,
          error: 'End time is required'
        });
      }
    }
    
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors in schedules',
        errors: validationErrors
      });
    }
    
    // Check for schedule conflicts
    const conflicts = [];
    
    for (let i = 0; i < schedules.length; i++) {
      const { day, room, startTime, endTime } = schedules[i];
      
      if (room) {
        const existingSchedule = await Schedule.findOne({
          day,
          room,
          $or: [
            {
              startTime: { $lt: endTime },
              endTime: { $gt: startTime }
            }
          ]
        }).session(session);
        
        if (existingSchedule) {
          conflicts.push({
            index: i,
            conflictingSchedule: existingSchedule,
            message: `Room ${room} is already booked during this time on ${day}`
          });
        }
      }
    }
    
    if (conflicts.length > 0) {
      await session.abortTransaction();
      session.endSession();
      
      return res.status(400).json({
        success: false,
        message: 'Schedule conflicts detected',
        conflicts
      });
    }
    
    // Create schedules
    const createdSchedules = await Schedule.insertMany(schedules, { session });
    
    await session.commitTransaction();
    session.endSession();
    
    // Populate and return created schedules
    const populatedSchedules = await Schedule.find({
      _id: { $in: createdSchedules.map(s => s._id) }
    })
    .populate('course', 'code title')
    .populate({
      path: 'lecturer',
      select: 'user',
      populate: {
        path: 'user',
        select: 'fullName email'
      }
    });
    
    res.status(201).json({
      success: true,
      message: `Successfully created ${createdSchedules.length} schedules`,
      data: populatedSchedules
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error creating bulk schedules:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating bulk schedules',
      error: error.message
    });
  }
};

/**
 * @desc    Update a schedule
 * @route   PUT /api/admin/schedules/:id
 * @access  Private/Admin
 */
exports.updateSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      course,
      lecturer,
      day,
      startTime,
      endTime,
      room,
      type,
      isRecurring
    } = req.body;
    
    // Find the schedule
    const schedule = await Schedule.findById(id);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Schedule not found'
      });
    }
    
    // Check for schedule conflicts if room or time is changing
    if (room && (room !== schedule.room || 
                 day !== schedule.day || 
                 startTime !== schedule.startTime || 
                 endTime !== schedule.endTime)) {
      
      const conflictingSchedule = await Schedule.findOne({
        _id: { $ne: id },
        day: day || schedule.day,
        room,
        $or: [
          {
            startTime: { $lt: endTime || schedule.endTime },
            endTime: { $gt: startTime || schedule.startTime }
          }
        ]
      });
      
      if (conflictingSchedule) {
        return res.status(400).json({
          success: false,
          message: `Room ${room} is already booked during this time on ${day || schedule.day}`,
          conflict: conflictingSchedule
        });
      }
    }
    
    // Update schedule
    const updatedSchedule = await Schedule.findByIdAndUpdate(
      id,
      {
        course: course || schedule.course,
        lecturer: lecturer || schedule.lecturer,
        day: day || schedule.day,
        startTime: startTime || schedule.startTime,
        endTime: endTime || schedule.endTime,
        room: room || schedule.room,
        type: type || schedule.type,
        isRecurring: isRecurring !== undefined ? isRecurring : schedule.isRecurring
      },
      { new: true }
    )
    .populate('course', 'code title')
    .populate({
      path: 'lecturer',
      select: 'user',
      populate: {
        path: 'user',
        select: 'fullName email'
      }
    });
    
    res.status(200).json({
      success: true,
      message: 'Schedule updated successfully',
      data: updatedSchedule
    });
  } catch (error) {
    console.error('Error updating schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating schedule',
      error: error.message
    });
  }
};

/**
 * @desc    Delete a schedule
 * @route   DELETE /api/admin/schedules/:id
 * @access  Private/Admin
 */
exports.deleteSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the schedule
    const schedule = await Schedule.findById(id);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Schedule not found'
      });
    }
    
    // Delete the schedule
    await Schedule.findByIdAndDelete(id);
    
    res.status(200).json({
      success: true,
      message: 'Schedule deleted successfully',
      data: { id }
    });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting schedule',
      error: error.message
    });
  }
};

/**
 * @desc    Delete course schedules
 * @route   DELETE /api/admin/schedules/course/:courseId
 * @access  Private/Admin
 */
exports.deleteCoursesSchedules = async (req, res) => {
  try {
    const { courseId } = req.params;
    
    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Delete all schedules for this course
    const result = await Schedule.deleteMany({ course: courseId });
    
    res.status(200).json({
      success: true,
      message: `Deleted ${result.deletedCount} schedule(s) for course ${course.code}`,
      data: {
        courseId,
        courseCode: course.code,
        deletedCount: result.deletedCount
      }
    });
  } catch (error) {
    console.error('Error deleting course schedules:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting course schedules',
      error: error.message
    });
  }
};

/**
 * @desc    Get all FAQs
 * @route   GET /api/admin/faqs
 * @access  Private/Admin
 */
exports.getAllFAQs = async (req, res) => {
  try {
    const {
      category,
      search,
      sortBy = 'order',
      sortOrder = 'asc'
    } = req.query;
    
    // Build query
    const query = {};
    
    if (category) query.category = category;
    
    if (search) {
      query.$or = [
        { question: { $regex: search, $options: 'i' } },
        { answer: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Prepare sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Get FAQs
    const faqs = await FAQ.find(query).sort(sort);
    
    res.status(200).json({
      success: true,
      count: faqs.length,
      data: faqs
    });
  } catch (error) {
    console.error('Error getting FAQs:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting FAQs',
      error: error.message
    });
  }
};

/**
 * @desc    Get FAQ by ID
 * @route   GET /api/admin/faqs/:faqId
 * @access  Private/Admin
 */
exports.getFAQById = async (req, res) => {
  try {
    const { faqId } = req.params;
    
    const faq = await FAQ.findById(faqId);
    
    if (!faq) {
      return res.status(404).json({
        success: false,
        message: 'FAQ not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: faq
    });
  } catch (error) {
    console.error('Error getting FAQ:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting FAQ',
      error: error.message
    });
  }
};

/**
 * @desc    Create a new FAQ
 * @route   POST /api/admin/faqs
 * @access  Private/Admin
 */
exports.createFAQ = async (req, res) => {
  try {
    const {
      question,
      answer,
      category,
      order,
      isPublished,
      audience
    } = req.body;
    
    // Validate required fields
    if (!question || !answer) {
      return res.status(400).json({
        success: false,
        message: 'Question and answer are required'
      });
    }
    
    // Create FAQ
    const faq = await FAQ.create({
      question,
      answer,
      category: category || 'general',
      order: order || 0,
      isPublished: isPublished !== undefined ? isPublished : true,
      audience: audience || 'all'
    });
    
    res.status(201).json({
      success: true,
      message: 'FAQ created successfully',
      data: faq
    });
  } catch (error) {
    console.error('Error creating FAQ:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating FAQ',
      error: error.message
    });
  }
};

/**
 * @desc    Update an FAQ
 * @route   PUT /api/admin/faqs/:faqId
 * @access  Private/Admin
 */
exports.updateFAQ = async (req, res) => {
  try {
    const { faqId } = req.params;
    const {
      question,
      answer,
      category,
      order,
      isPublished,
      audience
    } = req.body;
    
    // Find FAQ
    const faq = await FAQ.findById(faqId);
    if (!faq) {
      return res.status(404).json({
        success: false,
        message: 'FAQ not found'
      });
    }
    
    // Update FAQ
    const updatedFAQ = await FAQ.findByIdAndUpdate(
      faqId,
      {
        question: question || faq.question,
        answer: answer || faq.answer,
        category: category || faq.category,
        order: order !== undefined ? order : faq.order,
        isPublished: isPublished !== undefined ? isPublished : faq.isPublished,
        audience: audience || faq.audience
      },
      { new: true }
    );
    
    res.status(200).json({
      success: true,
      message: 'FAQ updated successfully',
      data: updatedFAQ
    });
  } catch (error) {
    console.error('Error updating FAQ:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating FAQ',
      error: error.message
    });
  }
};

/**
 * @desc    Delete an FAQ
 * @route   DELETE /api/admin/faqs/:faqId
 * @access  Private/Admin
 */
exports.deleteFAQ = async (req, res) => {
  try {
    const { faqId } = req.params;
    
    // Find FAQ
    const faq = await FAQ.findById(faqId);
    if (!faq) {
      return res.status(404).json({
        success: false,
        message: 'FAQ not found'
      });
    }
    
    // Delete FAQ
    await FAQ.findByIdAndDelete(faqId);
    
    res.status(200).json({
      success: true,
      message: 'FAQ deleted successfully',
      data: { id: faqId }
    });
  } catch (error) {
    console.error('Error deleting FAQ:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting FAQ',
      error: error.message
    });
  }
};

/**
 * @desc    Get all users
 * @route   GET /api/admin/users
 * @access  Private/Admin
 */
exports.getAllUsers = async (req, res) => {
  try {
    const {
      role,
      isActive,
      search,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    // Build query based on filters
    const query = {};
    
    if (role) query.role = role;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Prepare sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Get users with pagination and sorting
    const users = await User.find(query)
      .select('-password')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await User.countDocuments(query);
    
    // Get user stats
    const stats = {
      total: await User.countDocuments(),
      active: await User.countDocuments({ isActive: true }),
      students: await User.countDocuments({ role: 'student' }),
      lecturers: await User.countDocuments({ role: 'lecturer' }),
      admins: await User.countDocuments({ role: 'admin' })
    };
    
    res.status(200).json({
      success: true,
      count: users.length,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      },
      stats,
      data: users
    });
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting users',
      error: error.message
    });
  }
};

/**
 * @desc    Get user by ID
 * @route   GET /api/admin/users/:id
 * @access  Private/Admin
 */
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find user and exclude password
    const user = await User.findById(id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Get additional role-specific data
    let roleData = null;
    
    if (user.role === 'student') {
      roleData = await Student.findOne({ user: id })
        .populate('department', 'name code')
        .populate('courses', 'code title');
    } else if (user.role === 'lecturer') {
      roleData = await Lecturer.findOne({ user: id })
        .populate('department', 'name code')
        .populate('courses', 'code title');
    }
    
    res.status(200).json({
      success: true,
      data: {
        user,
        roleData
      }
    });
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting user',
      error: error.message
    });
  }
};

/**
 * @desc    Update user
 * @route   PUT /api/admin/users/:id
 * @access  Private/Admin
 */
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      fullName,
      email,
      phoneNumber,
      isActive,
      profileImage
    } = req.body;
    
    // Find user
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check if email is being changed and already exists
    if (email && email !== user.email) {
      const existingUser = await User.findOne({
        email,
        _id: { $ne: id }
      });
      
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use'
        });
      }
    }
    
    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      id,
      {
        fullName: fullName || user.fullName,
        email: email || user.email,
        phoneNumber: phoneNumber || user.phoneNumber,
        isActive: isActive !== undefined ? isActive : user.isActive,
        profileImage: profileImage || user.profileImage
      },
      { new: true }
    ).select('-password');
    
    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: updatedUser
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user',
      error: error.message
    });
  }
};

/**
 * @desc    Delete user
 * @route   DELETE /api/admin/users/:id
 * @access  Private/Admin
 */
exports.deleteUser = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    
    // Check if user exists
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check if user has role-specific data to delete
    if (user.role === 'student') {
      const student = await Student.findOne({ user: id });
      
      if (student) {
        // Delete enrollments for student
        await Enrollment.deleteMany({ student: student._id }, { session });
        
        // Delete student record
        await Student.findByIdAndDelete(student._id, { session });
      }
    } else if (user.role === 'lecturer') {
      const lecturer = await Lecturer.findOne({ user: id });
      
      if (lecturer) {
        // Update courses to remove this lecturer
        await Course.updateMany(
          { lecturer: lecturer._id },
          { $unset: { lecturer: "" } },
          { session }
        );
        
        // Delete schedules for this lecturer
        await Schedule.deleteMany({ lecturer: lecturer._id }, { session });
        
        // Delete lecturer record
        await Lecturer.findByIdAndDelete(lecturer._id, { session });
      }
    }
    
    // Finally delete user
    await User.findByIdAndDelete(id, { session });
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(200).json({
      success: true,
      message: 'User deleted successfully',
      data: { id }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user',
      error: error.message
    });
  }
};

/**
 * @desc    Create user
 * @route   POST /api/admin/users
 * @access  Private/Admin
 */
exports.createUser = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const {
      fullName,
      email,
      password,
      role,
      phoneNumber,
      department, // Changed from departmentId to department for flexibility
      matricNumber,
      staffId,
      level,
      specialization
    } = req.body;
    
    // Validate required fields
    if (!fullName || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Please provide fullName, email, password and role'
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    
    // Validate additional fields for specific roles
    if (role === 'student' && (!matricNumber || !level)) {
      return res.status(400).json({
        success: false,
        message: 'Student requires matricNumber and level'
      });
    }
    
    if (role === 'lecturer' && !staffId) {
      return res.status(400).json({
        success: false,
        message: 'Lecturer requires staffId'
      });
    }
    
    if ((role === 'student' || role === 'lecturer') && !department) {
      return res.status(400).json({
        success: false,
        message: 'Department is required for students and lecturers'
      });
    }
    
    // Resolve department ID from name or ID
    let departmentId = department;

    // If department is a string but not a valid ObjectId, try to find by name
    if (typeof department === 'string' && !mongoose.Types.ObjectId.isValid(department)) {
      console.log(`Looking up department by name: ${department}`);
      const departmentDoc = await Department.findOne({
        name: { $regex: new RegExp(`^${department}$`, 'i') }
      });

      if (!departmentDoc) {
        return res.status(404).json({
          success: false,
          message: `Department "${department}" not found. Please check the department name.`
        });
      }

      console.log(`Found department: ${departmentDoc.name} with ID: ${departmentDoc._id}`);
      departmentId = departmentDoc._id;
    } else if (department) {
      // If it's already an ObjectId, verify it exists
      const departmentExists = await Department.findById(departmentId);
      if (!departmentExists) {
        return res.status(404).json({
          success: false,
          message: 'Department not found with the provided ID'
        });
      }
    }
    
    // Check if matric/staff ID already exists
    if (role === 'student' && matricNumber) {
      const existingStudent = await Student.findOne({ matricNumber });
      if (existingStudent) {
        return res.status(400).json({
          success: false,
          message: 'Student with this matric number already exists'
        });
      }
    }
    
    if (role === 'lecturer' && staffId) {
      const existingLecturer = await Lecturer.findOne({ staffId });
      if (existingLecturer) {
        return res.status(400).json({
          success: false,
          message: 'Lecturer with this staff ID already exists'
        });
      }
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create user
    const user = await User.create([{
      fullName,
      email,
      password: hashedPassword,
      role,
      phoneNumber: phoneNumber || '',
      isActive: true
    }], { session });
    
    // Create role-specific record
    let roleData = null;
    
    if (role === 'student') {
      roleData = await Student.create([{
        user: user[0]._id,
        matricNumber,
        department: departmentId,
        level: parseInt(level),
        currentSession: null,
        courses: []
      }], { session });
    } else if (role === 'lecturer') {
      roleData = await Lecturer.create([{
        user: user[0]._id,
        staffId,
        department: departmentId,
        specialization: specialization || '',
        courses: []
      }], { session });
    }
    
    await session.commitTransaction();
    session.endSession();
    
    // Return user without password
    const newUser = await User.findById(user[0]._id).select('-password');
    
    // Get department name for response
    let departmentDetails = null;
    if (departmentId) {
      departmentDetails = await Department.findById(departmentId).select('name code');
    }
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        user: newUser,
        roleData,
        department: departmentDetails
      }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating user',
      error: error.message
    });
  }
};

/**
 * @desc    Create multiple users at once
 * @route   POST /api/admin/users/bulk
 * @access  Private/Admin
 */
exports.createUser = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const {
      fullName,
      email,
      password,
      role,
      phoneNumber,
      department, // Changed from departmentId to department for flexibility
      matricNumber,
      staffId,
      level,
      specialization
    } = req.body;
    
    // Validate required fields
    if (!fullName || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Please provide fullName, email, password and role'
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    
    // Validate additional fields for specific roles
    if (role === 'student' && (!matricNumber || !level)) {
      return res.status(400).json({
        success: false,
        message: 'Student requires matricNumber and level'
      });
    }
    
    if (role === 'lecturer' && !staffId) {
      return res.status(400).json({
        success: false,
        message: 'Lecturer requires staffId'
      });
    }
    
    if ((role === 'student' || role === 'lecturer') && !department) {
      return res.status(400).json({
        success: false,
        message: 'Department is required for students and lecturers'
      });
    }
    
    // Resolve department ID from name or ID
    let departmentId = department;

    // If department is a string but not a valid ObjectId, try to find by name
    if (typeof department === 'string' && !mongoose.Types.ObjectId.isValid(department)) {
      console.log(`Looking up department by name: ${department}`);
      const departmentDoc = await Department.findOne({
        name: { $regex: new RegExp(`^${department}$`, 'i') }
      });

      if (!departmentDoc) {
        return res.status(404).json({
          success: false,
          message: `Department "${department}" not found. Please check the department name.`
        });
      }

      console.log(`Found department: ${departmentDoc.name} with ID: ${departmentDoc._id}`);
      departmentId = departmentDoc._id;
    } else if (department) {
      // If it's already an ObjectId, verify it exists
      const departmentExists = await Department.findById(departmentId);
      if (!departmentExists) {
        return res.status(404).json({
          success: false,
          message: 'Department not found with the provided ID'
        });
      }
    }
    
    // Check if matric/staff ID already exists
    if (role === 'student' && matricNumber) {
      const existingStudent = await Student.findOne({ matricNumber });
      if (existingStudent) {
        return res.status(400).json({
          success: false,
          message: 'Student with this matric number already exists'
        });
      }
    }
    
    if (role === 'lecturer' && staffId) {
      const existingLecturer = await Lecturer.findOne({ staffId });
      if (existingLecturer) {
        return res.status(400).json({
          success: false,
          message: 'Lecturer with this staff ID already exists'
        });
      }
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create user
    const user = await User.create([{
      fullName,
      email,
      password: hashedPassword,
      role,
      phoneNumber: phoneNumber || '',
      isActive: true
    }], { session });
    
    // Create role-specific record
    let roleData = null;
    
    if (role === 'student') {
      roleData = await Student.create([{
        user: user[0]._id,
        matricNumber,
        department: departmentId,
        level: parseInt(level),
        currentSession: null,
        courses: []
      }], { session });
    } else if (role === 'lecturer') {
      roleData = await Lecturer.create([{
        user: user[0]._id,
        staffId,
        department: departmentId,
        specialization: specialization || '',
        courses: []
      }], { session });
    }
    
    await session.commitTransaction();
    session.endSession();
    
    // Return user without password
    const newUser = await User.findById(user[0]._id).select('-password');
    
    // Get department name for response
    let departmentDetails = null;
    if (departmentId) {
      departmentDetails = await Department.findById(departmentId).select('name code');
    }
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        user: newUser,
        roleData,
        department: departmentDetails
      }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating user',
      error: error.message
    });
  }
};

/**
 * @desc    Toggle user's active status
 * @route   PATCH /api/admin/users/:userId/status
 * @access  Private/Admin
 */
exports.toggleUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;
    
    // Check if status is provided
    if (isActive === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Please provide isActive status'
      });
    }
    
    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Prevent deactivating the current user
    if (userId === req.user.id && isActive === false) {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own account'
      });
    }
    
    // Update user status
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { isActive },
      { new: true }
    ).select('-password');
    
    res.status(200).json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: updatedUser
    });
  } catch (error) {
    console.error('Error toggling user status:', error);
    res.status(500).json({
      success: false,
      message: 'Error toggling user status',
      error: error.message
    });
  }
};

/**
 * @desc    Change user's role
 * @route   PATCH /api/admin/users/:userId/role
 * @access  Private/Admin
 */
exports.changeUserRole = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { userId } = req.params;
    const {
      role,
      departmentId,
      matricNumber,
      staffId,
      level,
      specialization
    } = req.body;
    
    // Validate role
    if (!role || !['admin', 'lecturer', 'student'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid role (admin, lecturer, or student)'
      });
    }
    
    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Prevent changing role of current user
    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot change your own role'
      });
    }
    
    // Handle role-specific data
    if (role === 'student') {
      // Validate student fields
      if (!matricNumber || !level || !departmentId) {
        return res.status(400).json({
          success: false,
          message: 'Student requires matricNumber, level, and departmentId'
        });
      }
      
      // Check if department exists
      const department = await Department.findById(departmentId);
      if (!department) {
        return res.status(404).json({
          success: false,
          message: 'Department not found'
        });
      }
      
      // Check if matric number is unique
      const existingStudent = await Student.findOne({ 
        matricNumber,
        user: { $ne: userId }
      });
      
      if (existingStudent) {
        return res.status(400).json({
          success: false,
          message: 'Student with this matric number already exists'
        });
      }
      
      // Delete any existing lecturer data
      await Lecturer.findOneAndDelete({ user: userId }, { session });
      
      // Create or update student record
      let student = await Student.findOne({ user: userId });
      
      if (student) {
        student.matricNumber = matricNumber;
        student.department = departmentId;
        student.level = parseInt(level);
        await student.save({ session });
      } else {
        student = await Student.create([{
          user: userId,
          matricNumber,
          department: departmentId,
          level: parseInt(level),
          courses: []
        }], { session });
      }
    } else if (role === 'lecturer') {
      // Validate lecturer fields
      if (!staffId || !departmentId) {
        return res.status(400).json({
          success: false,
          message: 'Lecturer requires staffId and departmentId'
        });
      }
      
      // Check if department exists
      const department = await Department.findById(departmentId);
      if (!department) {
        return res.status(404).json({
          success: false,
          message: 'Department not found'
        });
      }
      
      // Check if staff ID is unique
      const existingLecturer = await Lecturer.findOne({
        staffId,
        user: { $ne: userId }
      });
      
      if (existingLecturer) {
        return res.status(400).json({
          success: false,
          message: 'Lecturer with this staff ID already exists'
        });
      }
      
      // Delete any existing student data
      await Student.findOneAndDelete({ user: userId }, { session });
      
      // Create or update lecturer record
      let lecturer = await Lecturer.findOne({ user: userId });
      
      if (lecturer) {
        lecturer.staffId = staffId;
        lecturer.department = departmentId;
        lecturer.specialization = specialization || '';
        await lecturer.save({ session });
      } else {
        lecturer = await Lecturer.create([{
          user: userId,
          staffId,
          department: departmentId,
          specialization: specialization || '',
          courses: []
        }], { session });
      }
    } else if (role === 'admin') {
      // Delete any existing role-specific records
      await Student.findOneAndDelete({ user: userId }, { session });
      await Lecturer.findOneAndDelete({ user: userId }, { session });
    }
    
    // Update user's role
    user.role = role;
    await user.save({ session });
    
    await session.commitTransaction();
    session.endSession();
    
    // Get updated user without password
    const updatedUser = await User.findById(userId).select('-password');
    
    res.status(200).json({
      success: true,
      message: `User role changed to ${role} successfully`,
      data: updatedUser
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error changing user role:', error);
    res.status(500).json({
      success: false,
      message: 'Error changing user role',
      error: error.message
    });
  }
};

/**
 * @desc    Reset user's password
 * @route   POST /api/admin/users/:userId/reset-password
 * @access  Private/Admin
 */
exports.resetUserPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;
    
    // Validate password
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }
    
    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Update password
    user.password = hashedPassword;
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({
      success: false,
      message: 'Error resetting password',
      error: error.message
    });
  }
};

/**
 * @desc    Get all students
 * @route   GET /api/admin/students
 * @access  Private/Admin
 */
exports.getAllStudents = async (req, res) => {
  try {
    const {
      search,
      department,
      level,
      isActive,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    // Stage 1: Find students with their user data
    let studentsQuery = Student.find()
      .populate({
        path: 'user',
        select: 'fullName email phoneNumber isActive createdAt profileImage'
      })
      .populate('department', 'name code')
      .populate('courses', 'code title');
    
    // Apply filters to the query
    let filterApplied = false;
    
    if (search) {
      // Get users matching search criteria first
      const users = await User.find({
        $or: [
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      
      // Get students with matching matric numbers
      const matricStudents = await Student.find({
        matricNumber: { $regex: search, $options: 'i' }
      }).select('_id');
      
      const userIds = users.map(user => user._id);
      const studentIds = matricStudents.map(student => student._id);
      
      studentsQuery = studentsQuery.where({
        $or: [
          { user: { $in: userIds } },
          { _id: { $in: studentIds } }
        ]
      });
      
      filterApplied = true;
    }
    
    if (department) {
      studentsQuery = studentsQuery.where({ department });
      filterApplied = true;
    }
    
    if (level) {
      studentsQuery = studentsQuery.where({ level: parseInt(level) });
      filterApplied = true;
    }
    
    if (isActive !== undefined) {
      // For active status, we need to filter at the user level
      const activeFilter = isActive === 'true';
      const users = await User.find({ isActive: activeFilter }).select('_id');
      const userIds = users.map(user => user._id);
      
      studentsQuery = studentsQuery.where({ user: { $in: userIds } });
      filterApplied = true;
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Prepare sort object
    const sort = {};
    if (sortBy.startsWith('user.')) {
      // If sorting by user field, we'll need to handle it after fetching
      const userField = sortBy.replace('user.', '');
      sort[userField] = sortOrder === 'asc' ? 1 : -1;
    } else {
      // Normal sorting
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    }
    
    // Execute query with pagination
    let students = await studentsQuery
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));
    
    // If sorting by user field, we need to sort manually
    if (sortBy.startsWith('user.')) {
      const userField = sortBy.replace('user.', '');
      students = students.sort((a, b) => {
        if (!a.user || !b.user) return 0;
        if (sortOrder === 'asc') {
          return a.user[userField] > b.user[userField] ? 1 : -1;
        } else {
          return a.user[userField] < b.user[userField] ? 1 : -1;
        }
      });
    }
    
    // Get total count for pagination
    const countQuery = filterApplied ? Student.find(studentsQuery.getFilter()) : Student.find();
    const total = await countQuery.countDocuments();
    
    // Get statistics
    const stats = {
      total: await Student.countDocuments(),
      byLevel: await Student.aggregate([
        { $group: { _id: '$level', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      byDepartment: await Student.aggregate([
        { $lookup: {
            from: 'departments',
            localField: 'department',
            foreignField: '_id',
            as: 'departmentInfo'
          }
        },
        { $unwind: '$departmentInfo' },
        { $group: {
            _id: '$department',
            departmentName: { $first: '$departmentInfo.name' },
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ])
    };
    
    res.status(200).json({
      success: true,
      count: students.length,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      },
      stats,
      data: students
    });
  } catch (error) {
    console.error('Error getting students:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting students',
      error: error.message
    });
  }
};

/**
 * @desc    Create a new student
 * @route   POST /api/admin/students
 * @access  Private/Admin
 */
exports.createStudent = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const {
      fullName,
      email,
      password,
      phoneNumber,
      matricNumber,
      level,
      department,
      profileImage
    } = req.body;
    
    // Validate required fields
    if (!fullName || !email || !password || !matricNumber || !level || !department) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: fullName, email, password, matricNumber, level, department'
      });
    }
    
    // Check if user with email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    
    // Check if student with matric number already exists
    const existingStudent = await Student.findOne({ matricNumber });
    if (existingStudent) {
      return res.status(400).json({
        success: false,
        message: 'Student with this matric number already exists'
      });
    }
    
    // Check if department exists
    const departmentExists = await Department.findById(department);
    if (!departmentExists) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create user with student role
    const user = await User.create([{
      fullName,
      email,
      password: hashedPassword,
      phoneNumber: phoneNumber || '',
      role: 'student',
      isActive: true,
      profileImage
    }], { session });
    
    // Create student profile
    const student = await Student.create([{
      user: user[0]._id,
      matricNumber,
      level: parseInt(level),
      department,
      courses: []
    }], { session });
    
    await session.commitTransaction();
    session.endSession();
    
    // Return created student with populated fields
    const createdStudent = await Student.findById(student[0]._id)
      .populate({
        path: 'user',
        select: '-password'
      })
      .populate('department', 'name code');
    
    res.status(201).json({
      success: true,
      message: 'Student created successfully',
      data: createdStudent
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error creating student:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating student',
      error: error.message
    });
  }
};

/**
 * @desc    Update a student
 * @route   PUT /api/admin/students/:id
 * @access  Private/Admin
 */
exports.updateStudent = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    const {
      fullName,
      email,
      phoneNumber,
      matricNumber,
      level,
      department,
      isActive,
      profileImage
    } = req.body;
    
    // Find student
    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }
    
    // Find associated user
    const user = await User.findById(student.user);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Associated user not found'
      });
    }
    
    // Check if matric number is being changed and already exists
    if (matricNumber && matricNumber !== student.matricNumber) {
      const existingStudent = await Student.findOne({
        matricNumber,
        _id: { $ne: id }
      });
      
      if (existingStudent) {
        return res.status(400).json({
          success: false,
          message: 'Student with this matric number already exists'
        });
      }
    }
    
    // Check if email is being changed and already exists
    if (email && email !== user.email) {
      const existingUser = await User.findOne({
        email,
        _id: { $ne: user._id }
      });
      
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'User with this email already exists'
        });
      }
    }
    
    // Check if department exists if being changed
    if (department && department !== student.department.toString()) {
      const departmentExists = await Department.findById(department);
      if (!departmentExists) {
        return res.status(404).json({
          success: false,
          message: 'Department not found'
        });
      }
    }
    
    // Update user information
    if (fullName || email || phoneNumber || isActive !== undefined || profileImage) {
      const updateData = {};
      
      if (fullName) updateData.fullName = fullName;
      if (email) updateData.email = email;
      if (phoneNumber) updateData.phoneNumber = phoneNumber;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (profileImage) updateData.profileImage = profileImage;
      
      await User.findByIdAndUpdate(
        user._id,
        updateData,
        { session }
      );
    }
    
    // Update student information
    if (matricNumber || level || department) {
      const updateData = {};
      
      if (matricNumber) updateData.matricNumber = matricNumber;
      if (level) updateData.level = parseInt(level);
      if (department) updateData.department = department;
      
      await Student.findByIdAndUpdate(
        id,
        updateData,
        { session }
      );
    }
    
    await session.commitTransaction();
    session.endSession();
    
    // Return updated student with populated fields
    const updatedStudent = await Student.findById(id)
      .populate({
        path: 'user',
        select: '-password'
      })
      .populate('department', 'name code');
    
    res.status(200).json({
      success: true,
      message: 'Student updated successfully',
      data: updatedStudent
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error updating student:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating student',
      error: error.message
    });
  }
};

/**
 * @desc    Delete a student
 * @route   DELETE /api/admin/students/:id
 * @access  Private/Admin
 */
exports.deleteStudent = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    
    // Find student
    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }
    
    // Delete all enrollments for this student
    await Enrollment.deleteMany({ student: id }, { session });
    
    // Get user ID for deletion
    const userId = student.user;
    
    // Delete student record
    await Student.findByIdAndDelete(id, { session });
    
    // Delete associated user
    await User.findByIdAndDelete(userId, { session });
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(200).json({
      success: true,
      message: 'Student deleted successfully',
      data: { id }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error deleting student:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting student',
      error: error.message
    });
  }
};
/**
 * @desc    Get all lecturers
 * @route   GET /api/admin/lecturers
 * @access  Private/Admin
 */
exports.getAllLecturers = async (req, res) => {
  try {
    const {
      search,
      department,
      isActive,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    // Stage 1: Find lecturers with their user data
    let lecturersQuery = Lecturer.find()
      .populate({
        path: 'user',
        select: 'fullName email phoneNumber isActive createdAt profileImage'
      })
      .populate('department', 'name code')
      .populate('courses', 'code title');
    
    // Apply filters to the query
    let filterApplied = false;
    
    if (search) {
      // Get users matching search criteria first
      const users = await User.find({
        $or: [
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      
      // Get lecturers with matching staff IDs
      const staffLecturers = await Lecturer.find({
        staffId: { $regex: search, $options: 'i' }
      }).select('_id');
      
      const userIds = users.map(user => user._id);
      const lecturerIds = staffLecturers.map(lecturer => lecturer._id);
      
      lecturersQuery = lecturersQuery.where({
        $or: [
          { user: { $in: userIds } },
          { _id: { $in: lecturerIds } }
        ]
      });
      
      filterApplied = true;
    }
    
    if (department) {
      lecturersQuery = lecturersQuery.where({ department });
      filterApplied = true;
    }
    
    if (isActive !== undefined) {
      // For active status, we need to filter at the user level
      const activeFilter = isActive === 'true';
      const users = await User.find({ isActive: activeFilter }).select('_id');
      const userIds = users.map(user => user._id);
      
      lecturersQuery = lecturersQuery.where({ user: { $in: userIds } });
      filterApplied = true;
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Prepare sort object
    const sort = {};
    if (sortBy.startsWith('user.')) {
      // If sorting by user field, we'll need to handle it after fetching
      const userField = sortBy.replace('user.', '');
      sort[userField] = sortOrder === 'asc' ? 1 : -1;
    } else {
      // Normal sorting
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    }
    
    // Execute query with pagination
    let lecturers = await lecturersQuery
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));
    
    // If sorting by user field, we need to sort manually
    if (sortBy.startsWith('user.')) {
      const userField = sortBy.replace('user.', '');
      lecturers = lecturers.sort((a, b) => {
        if (!a.user || !b.user) return 0;
        if (sortOrder === 'asc') {
          return a.user[userField] > b.user[userField] ? 1 : -1;
        } else {
          return a.user[userField] < b.user[userField] ? 1 : -1;
        }
      });
    }
    
    // Get total count for pagination
    const countQuery = filterApplied ? Lecturer.find(lecturersQuery.getFilter()) : Lecturer.find();
    const total = await countQuery.countDocuments();
    
    // Get statistics
    const stats = {
      total: await Lecturer.countDocuments(),
      byDepartment: await Lecturer.aggregate([
        { $lookup: {
            from: 'departments',
            localField: 'department',
            foreignField: '_id',
            as: 'departmentInfo'
          }
        },
        { $unwind: '$departmentInfo' },
        { $group: {
            _id: '$department',
            departmentName: { $first: '$departmentInfo.name' },
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]),
      courseLoad: await Lecturer.aggregate([
        { $project: {
            _id: 1,
            courseCount: { $size: "$courses" }
          }
        },
        { $group: {
            _id: null,
            avgCourses: { $avg: "$courseCount" },
            maxCourses: { $max: "$courseCount" },
            minCourses: { $min: "$courseCount" }
          }
        }
      ])
    };
    
    res.status(200).json({
      success: true,
      count: lecturers.length,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      },
      stats,
      data: lecturers
    });
  } catch (error) {
    console.error('Error getting lecturers:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting lecturers',
      error: error.message
    });
  }
};

/**
 * @desc    Create a new lecturer
 * @route   POST /api/admin/lecturers
 * @access  Private/Admin
 */
exports.createLecturer = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const {
      fullName,
      email,
      password,
      phoneNumber,
      staffId,
      department,
      specialization,
      profileImage
    } = req.body;
    
    // Validate required fields
    if (!fullName || !email || !password || !staffId || !department) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: fullName, email, password, staffId, department'
      });
    }
    
    // Check if user with email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    
    // Check if lecturer with staff ID already exists
    const existingLecturer = await Lecturer.findOne({ staffId });
    if (existingLecturer) {
      return res.status(400).json({
        success: false,
        message: 'Lecturer with this staff ID already exists'
      });
    }
    
    // Check if department exists
    const departmentExists = await Department.findById(department);
    if (!departmentExists) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create user with lecturer role
    const user = await User.create([{
      fullName,
      email,
      password: hashedPassword,
      phoneNumber: phoneNumber || '',
      role: 'lecturer',
      isActive: true,
      profileImage
    }], { session });
    
    // Create lecturer profile
    const lecturer = await Lecturer.create([{
      user: user[0]._id,
      staffId,
      department,
      specialization: specialization || '',
      courses: []
    }], { session });
    
    await session.commitTransaction();
    session.endSession();
    
    // Return created lecturer with populated fields
    const createdLecturer = await Lecturer.findById(lecturer[0]._id)
      .populate({
        path: 'user',
        select: '-password'
      })
      .populate('department', 'name code');
    
    res.status(201).json({
      success: true,
      message: 'Lecturer created successfully',
      data: createdLecturer
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error creating lecturer:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating lecturer',
      error: error.message
    });
  }
};

/**
 * @desc    Update a lecturer
 * @route   PUT /api/admin/lecturers/:id
 * @access  Private/Admin
 */
exports.updateLecturer = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    const {
      fullName,
      email,
      phoneNumber,
      staffId,
      department,
      specialization,
      isActive,
      profileImage
    } = req.body;
    
    // Find lecturer
    const lecturer = await Lecturer.findById(id);
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer not found'
      });
    }
    
    // Find associated user
    const user = await User.findById(lecturer.user);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Associated user not found'
      });
    }
    
    // Check if staff ID is being changed and already exists
    if (staffId && staffId !== lecturer.staffId) {
      const existingLecturer = await Lecturer.findOne({
        staffId,
        _id: { $ne: id }
      });
      
      if (existingLecturer) {
        return res.status(400).json({
          success: false,
          message: 'Lecturer with this staff ID already exists'
        });
      }
    }
    
    // Check if email is being changed and already exists
    if (email && email !== user.email) {
      const existingUser = await User.findOne({
        email,
        _id: { $ne: user._id }
      });
      
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'User with this email already exists'
        });
      }
    }
    
    // Check if department exists if being changed
    if (department && department !== lecturer.department.toString()) {
      const departmentExists = await Department.findById(department);
      if (!departmentExists) {
        return res.status(404).json({
          success: false,
          message: 'Department not found'
        });
      }
    }
    
    // Update user information
    if (fullName || email || phoneNumber || isActive !== undefined || profileImage) {
      const updateData = {};
      
      if (fullName) updateData.fullName = fullName;
      if (email) updateData.email = email;
      if (phoneNumber) updateData.phoneNumber = phoneNumber;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (profileImage) updateData.profileImage = profileImage;
      
      await User.findByIdAndUpdate(
        user._id,
        updateData,
        { session }
      );
    }
    
    // Update lecturer information
    if (staffId || department || specialization) {
      const updateData = {};
      
      if (staffId) updateData.staffId = staffId;
      if (department) updateData.department = department;
      if (specialization !== undefined) updateData.specialization = specialization;
      
      await Lecturer.findByIdAndUpdate(
        id,
        updateData,
        { session }
      );
    }
    
    await session.commitTransaction();
    session.endSession();
    
    // Return updated lecturer with populated fields
    const updatedLecturer = await Lecturer.findById(id)
      .populate({
        path: 'user',
        select: '-password'
      })
      .populate('department', 'name code')
      .populate('courses', 'code title');
    
    res.status(200).json({
      success: true,
      message: 'Lecturer updated successfully',
      data: updatedLecturer
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error updating lecturer:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating lecturer',
      error: error.message
    });
  }
};

/**
 * @desc    Delete a lecturer
 * @route   DELETE /api/admin/lecturers/:id
 * @access  Private/Admin
 */
exports.deleteLecturer = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    
    // Find lecturer
    const lecturer = await Lecturer.findById(id);
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer not found'
      });
    }
    
    // Update courses to remove this lecturer
    await Course.updateMany(
      { lecturer: id },
      { $unset: { lecturer: "" } },
      { session }
    );
    
    // Delete schedules for this lecturer
    await Schedule.deleteMany({ lecturer: id }, { session });
    
    // Get user ID for deletion
    const userId = lecturer.user;
    
    // Delete lecturer record
    await Lecturer.findByIdAndDelete(id, { session });
    
    // Delete associated user
    await User.findByIdAndDelete(userId, { session });
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(200).json({
      success: true,
      message: 'Lecturer deleted successfully',
      data: { id }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error deleting lecturer:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting lecturer',
      error: error.message
    });
  }
};

/**
 * @desc    Get lecturers by department
 * @route   GET /api/admin/lecturers/department/:departmentName
 * @access  Private/Admin
 */
exports.getLecturersByDepartment = async (req, res) => {
  try {
    const { departmentName } = req.params;
    
    // Find department
    const department = await Department.findOne({
      name: { $regex: new RegExp(`^${departmentName}$`, 'i') }
    });
    
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }
    
    // Get lecturers for this department
    const lecturers = await Lecturer.find({ department: department._id })
      .populate({
        path: 'user',
        select: 'fullName email phoneNumber isActive profileImage'
      })
      .populate('courses', 'code title');
    
    // Get department stats
    const stats = {
      totalLecturers: lecturers.length,
      courseDistribution: await Lecturer.aggregate([
        { $match: { department: department._id } },
        { $project: {
            _id: 1,
            courseCount: { $size: "$courses" }
          }
        },
        { $group: {
            _id: "$courseCount",
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      averageCourseLoad: await Lecturer.aggregate([
        { $match: { department: department._id } },
        { $project: {
            _id: 1,
            courseCount: { $size: "$courses" }
          }
        },
        { $group: {
            _id: null,
            avgCourses: { $avg: "$courseCount" }
          }
        }
      ])
    };
    
    res.status(200).json({
      success: true,
      count: lecturers.length,
      data: {
        department,
        stats,
        lecturers
      }
    });
  } catch (error) {
    console.error('Error getting lecturers by department:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting lecturers by department',
      error: error.message
    });
  }
};

/**
 * @desc    Assign a course to a lecturer
 * @route   POST /api/admin/assign-course
 * @access  Private/Admin
 */
exports.assignCourse = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { lecturerId, courseId } = req.body;
    
    // Validate required fields
    if (!lecturerId || !courseId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both lecturerId and courseId'
      });
    }
    
    // Check if lecturer exists
    const lecturer = await Lecturer.findById(lecturerId);
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer not found'
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
    
    // Check if course is already assigned to lecturer
    if (lecturer.courses.includes(courseId)) {
      return res.status(400).json({
        success: false,
        message: 'Course is already assigned to this lecturer'
      });
    }
    
    // Remove course from previous lecturer if exists
    if (course.lecturer) {
      await Lecturer.findByIdAndUpdate(
        course.lecturer,
        { $pull: { courses: courseId } },
        { session }
      );
    }
    
    // Assign course to lecturer
    await Lecturer.findByIdAndUpdate(
      lecturerId,
      { $addToSet: { courses: courseId } },
      { session }
    );
    
    // Update course with lecturer
    await Course.findByIdAndUpdate(
      courseId,
      { lecturer: lecturerId },
      { session }
    );
    
    await session.commitTransaction();
    session.endSession();
    
    // Return updated lecturer with courses
    const updatedLecturer = await Lecturer.findById(lecturerId)
      .populate({
        path: 'user',
        select: 'fullName email'
      })
      .populate('department', 'name')
      .populate('courses', 'code title');
    
    res.status(200).json({
      success: true,
      message: 'Course assigned successfully',
      data: updatedLecturer
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error assigning course:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning course',
      error: error.message
    });
  }
};

/**
 * @desc    Assign multiple courses to a lecturer
 * @route   POST /api/admin/assign-courses
 * @access  Private/Admin
 */
exports.assignMultipleCourses = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { lecturerId, courseIds } = req.body;
    
    // Validate required fields
    if (!lecturerId || !courseIds || !Array.isArray(courseIds) || courseIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide lecturerId and an array of courseIds'
      });
    }
    
    // Check if lecturer exists
    const lecturer = await Lecturer.findById(lecturerId);
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer not found'
      });
    }
    
    // Validate all courses exist
    const courses = await Course.find({ _id: { $in: courseIds } });
    if (courses.length !== courseIds.length) {
      return res.status(404).json({
        success: false,
        message: 'One or more courses not found'
      });
    }
    
    // Remove courses from previous lecturers
    for (const course of courses) {
      if (course.lecturer && course.lecturer.toString() !== lecturerId) {
        await Lecturer.findByIdAndUpdate(
          course.lecturer,
          { $pull: { courses: course._id } },
          { session }
        );
      }
    }
    
    // Update courses with new lecturer
    await Course.updateMany(
      { _id: { $in: courseIds } },
      { lecturer: lecturerId },
      { session }
    );
    
    // Update lecturer's course list
    await Lecturer.findByIdAndUpdate(
      lecturerId,
      { $addToSet: { courses: { $each: courseIds } } },
      { session }
    );
    
    await session.commitTransaction();
    session.endSession();
    
    // Return updated lecturer with courses
    const updatedLecturer = await Lecturer.findById(lecturerId)
      .populate({
        path: 'user',
        select: 'fullName email'
      })
      .populate('department', 'name')
      .populate('courses', 'code title');
    
    res.status(200).json({
      success: true,
      message: `${courseIds.length} courses assigned successfully`,
      data: updatedLecturer
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error assigning multiple courses:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning multiple courses',
      error: error.message
    });
  }
};

/**
 * @desc    Remove a lecturer from a course
 * @route   DELETE /api/admin/courses/:courseId/lecturers/:lecturerId
 * @access  Private/Admin
 */
exports.removeLecturerFromCourse = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { courseId, lecturerId } = req.params;
    
    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Check if lecturer exists
    const lecturer = await Lecturer.findById(lecturerId);
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer not found'
      });
    }
    
    // Check if lecturer is actually assigned to course
    if (!course.lecturer || course.lecturer.toString() !== lecturerId) {
      return res.status(400).json({
        success: false,
        message: 'This lecturer is not assigned to this course'
      });
    }
    
    // Remove course from lecturer's courses
    await Lecturer.findByIdAndUpdate(
      lecturerId,
      { $pull: { courses: courseId } },
      { session }
    );
    
    // Remove lecturer from course
    await Course.findByIdAndUpdate(
      courseId,
      { $unset: { lecturer: "" } },
      { session }
    );
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(200).json({
      success: true,
      message: 'Lecturer removed from course successfully',
      data: {
        courseId,
        lecturerId
      }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error removing lecturer from course:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing lecturer from course',
      error: error.message
    });
  }
};

/**
 * @desc    Update course lecturers (replace lecturer)
 * @route   PUT /api/admin/courses/:courseId/lecturers
 * @access  Private/Admin
 */
exports.updateCourseLecturers = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { courseId } = req.params;
    const { lecturerId } = req.body;
    
    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Remove course from current lecturer if exists
    if (course.lecturer) {
      await Lecturer.findByIdAndUpdate(
        course.lecturer,
        { $pull: { courses: courseId } },
        { session }
      );
    }
    
    // If new lecturer provided, assign course
    if (lecturerId) {
      // Check if lecturer exists
      const lecturer = await Lecturer.findById(lecturerId);
      if (!lecturer) {
        return res.status(404).json({
          success: false,
          message: 'New lecturer not found'
        });
      }
      
      // Assign course to new lecturer
      await Lecturer.findByIdAndUpdate(
        lecturerId,
        { $addToSet: { courses: courseId } },
        { session }
      );
      
      // Update course with new lecturer
      await Course.findByIdAndUpdate(
        courseId,
        { lecturer: lecturerId },
        { session }
      );
    } else {
      // If no new lecturer, just remove lecturer from course
      await Course.findByIdAndUpdate(
        courseId,
        { $unset: { lecturer: "" } },
        { session }
      );
    }
    
    await session.commitTransaction();
    session.endSession();
    
    // Return updated course with lecturer info
    const updatedCourse = await Course.findById(courseId)
      .populate('department', 'name code')
      .populate({
        path: 'lecturer',
        populate: {
          path: 'user',
          select: 'fullName email'
        }
      });
    
    res.status(200).json({
      success: true,
      message: lecturerId ? 'Course lecturer updated successfully' : 'Course lecturer removed successfully',
      data: updatedCourse
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error updating course lecturers:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating course lecturers',
      error: error.message
    });
  }
};
/**
 * @desc    Get all departments
 * @route   GET /api/admin/departments
 * @access  Private/Admin
 */
exports.getAllDepartments = async (req, res) => {
  try {
    const {
      search,
      faculty,
      sortBy = 'name',
      sortOrder = 'asc',
      page = 1,
      limit = 50
    } = req.query;
    
    // Build query
    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { shortName: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (faculty) {
      query.faculty = faculty;
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Prepare sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Get departments with pagination
    const departments = await Department.find(query)
      .populate('faculty', 'name')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await Department.countDocuments(query);
    
    // Get count of courses, students, and lecturers for each department
    const departmentsWithStats = await Promise.all(departments.map(async dept => {
      const coursesCount = await Course.countDocuments({ department: dept._id });
      const studentsCount = await Student.countDocuments({ department: dept._id });
      const lecturersCount = await Lecturer.countDocuments({ department: dept._id });
      
      return {
        ...dept.toObject(),
        stats: {
          courses: coursesCount,
          students: studentsCount,
          lecturers: lecturersCount
        }
      };
    }));
    
    // Get overall stats
    const stats = {
      total: await Department.countDocuments(),
      byFaculty: await Department.aggregate([
        {
          $lookup: {
            from: 'faculties',
            localField: 'faculty',
            foreignField: '_id',
            as: 'facultyInfo'
          }
        },
        {
          $unwind: {
            path: '$facultyInfo',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $group: {
            _id: '$faculty',
            facultyName: { 
              $first: { 
                $ifNull: ['$facultyInfo.name', 'No Faculty'] 
              }
            },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        }
      ])
    };
    
    res.status(200).json({
      success: true,
      count: departments.length,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      },
      stats,
      data: departmentsWithStats
    });
  } catch (error) {
    console.error('Error getting departments:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting departments',
      error: error.message
    });
  }
};

/**
 * @desc    Create a new department
 * @route   POST /api/admin/departments
 * @access  Private/Admin
 */
exports.createDepartment = async (req, res) => {
  try {
    const {
      name,
      code,
      shortName,
      faculty,
      description,
      headOfDepartment,
      contactEmail,
      contactPhone,
      establishedYear
    } = req.body;
    
    // Validate required fields
    if (!name || !code) {
      return res.status(400).json({
        success: false,
        message: 'Please provide department name and code'
      });
    }
    
    // Check if department already exists with same name or code
    const existingDept = await Department.findOne({
      $or: [
        { name: { $regex: new RegExp(`^${name}$`, 'i') } },
        { code: { $regex: new RegExp(`^${code}$`, 'i') } }
      ]
    });
    
    if (existingDept) {
      return res.status(400).json({
        success: false,
        message: 'Department with this name or code already exists'
      });
    }
    
    // Check if faculty exists if provided
    if (faculty) {
      const facultyModel = mongoose.model('Faculty');
      const facultyExists = await facultyModel.findById(faculty);
      if (!facultyExists) {
        return res.status(404).json({
          success: false,
          message: 'Faculty not found'
        });
      }
    }
    
    // Check if head of department exists if provided
    if (headOfDepartment) {
      const lecturer = await Lecturer.findById(headOfDepartment);
      if (!lecturer) {
        return res.status(404).json({
          success: false,
          message: 'Head of department lecturer not found'
        });
      }
    }
    
    // Create department
    const department = await Department.create({
      name,
      code,
      shortName: shortName || code,
      faculty,
      description: description || '',
      headOfDepartment,
      contactEmail: contactEmail || '',
      contactPhone: contactPhone || '',
      establishedYear: establishedYear || new Date().getFullYear()
    });
    
    // Populate faculty and head of department if provided
    if (department.faculty || department.headOfDepartment) {
      await department.populate([
        { path: 'faculty', select: 'name' },
        {
          path: 'headOfDepartment',
          select: 'user staffId',
          populate: { path: 'user', select: 'fullName email' }
        }
      ]);
    }
    
    res.status(201).json({
      success: true,
      message: 'Department created successfully',
      data: department
    });
  } catch (error) {
    console.error('Error creating department:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating department',
      error: error.message
    });
  }
};

/**
 * @desc    Update a department
 * @route   PUT /api/admin/departments/:id
 * @access  Private/Admin
 */
exports.updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      code,
      shortName,
      faculty,
      description,
      headOfDepartment,
      contactEmail,
      contactPhone,
      establishedYear,
      isActive
    } = req.body;
    
    // Find department
    const department = await Department.findById(id);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }
    
    // Check if name or code is being changed and already exists
    if ((name && name !== department.name) || (code && code !== department.code)) {
      const existingDept = await Department.findOne({
        _id: { $ne: id },
        $or: [
          { name: { $regex: new RegExp(`^${name || department.name}$`, 'i') } },
          { code: { $regex: new RegExp(`^${code || department.code}$`, 'i') } }
        ]
      });
      
      if (existingDept) {
        return res.status(400).json({
          success: false,
          message: 'Department with this name or code already exists'
        });
      }
    }
    
    // Check if faculty exists if provided
    if (faculty && faculty !== department.faculty?.toString()) {
      const facultyModel = mongoose.model('Faculty');
      const facultyExists = await facultyModel.findById(faculty);
      if (!facultyExists) {
        return res.status(404).json({
          success: false,
          message: 'Faculty not found'
        });
      }
    }
    
    // Check if head of department exists if provided
    if (headOfDepartment && headOfDepartment !== department.headOfDepartment?.toString()) {
      const lecturer = await Lecturer.findById(headOfDepartment);
      if (!lecturer) {
        return res.status(404).json({
          success: false,
          message: 'Head of department lecturer not found'
        });
      }
    }
    
    // Update department
    const updatedDepartment = await Department.findByIdAndUpdate(
      id,
      {
        name: name || department.name,
        code: code || department.code,
        shortName: shortName || department.shortName,
        faculty: faculty || department.faculty,
        description: description !== undefined ? description : department.description,
        headOfDepartment: headOfDepartment || department.headOfDepartment,
        contactEmail: contactEmail !== undefined ? contactEmail : department.contactEmail,
        contactPhone: contactPhone !== undefined ? contactPhone : department.contactPhone,
        establishedYear: establishedYear || department.establishedYear,
        isActive: isActive !== undefined ? isActive : department.isActive
      },
      { new: true }
    );
    
    // Populate faculty and head of department
    await updatedDepartment.populate([
      { path: 'faculty', select: 'name' },
      {
        path: 'headOfDepartment',
        select: 'user staffId',
        populate: { path: 'user', select: 'fullName email' }
      }
    ]);
    
    // Get department stats
    const stats = {
      courses: await Course.countDocuments({ department: id }),
      students: await Student.countDocuments({ department: id }),
      lecturers: await Lecturer.countDocuments({ department: id })
    };
    
    res.status(200).json({
      success: true,
      message: 'Department updated successfully',
      data: {
        ...updatedDepartment.toObject(),
        stats
      }
    });
  } catch (error) {
    console.error('Error updating department:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating department',
      error: error.message
    });
  }
};

/**
 * @desc    Delete a department
 * @route   DELETE /api/admin/departments/:id
 * @access  Private/Admin
 */
exports.deleteDepartment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    
    // Find department
    const department = await Department.findById(id);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }
    
    // Check if department has any students or lecturers
    const studentsCount = await Student.countDocuments({ department: id });
    const lecturersCount = await Lecturer.countDocuments({ department: id });
    
    if (studentsCount > 0 || lecturersCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete department with existing students or lecturers',
        data: {
          studentsCount,
          lecturersCount
        }
      });
    }
    
    // Check for courses
    const coursesCount = await Course.countDocuments({ department: id });
    
    if (coursesCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete department with existing courses',
        data: {
          coursesCount
        }
      });
    }
    
    // Delete department
    await Department.findByIdAndDelete(id, { session });
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(200).json({
      success: true,
      message: 'Department deleted successfully',
      data: { id }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error deleting department:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting department',
      error: error.message
    });
  }
};

/**
 * @desc    Get department details by name
 * @route   GET /api/admin/departments/by-name/:departmentName
 * @access  Private/Admin
 */
exports.getDepartmentDetails = async (req, res) => {
  try {
    const { departmentName } = req.params;
    
    // Find department by name (case-insensitive)
    const department = await Department.findOne({
      name: { $regex: new RegExp(`^${departmentName}$`, 'i') }
    }).populate([
      { path: 'faculty', select: 'name' },
      {
        path: 'headOfDepartment',
        select: 'user staffId',
        populate: { path: 'user', select: 'fullName email phoneNumber' }
      }
    ]);
    
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }
    
    // Get department statistics
    const stats = {
      students: {
        total: await Student.countDocuments({ department: department._id }),
        byLevel: await Student.aggregate([
          { $match: { department: department._id } },
          { $group: { _id: '$level', count: { $sum: 1 } } },
          { $sort: { _id: 1 } }
        ])
      },
      lecturers: {
        total: await Lecturer.countDocuments({ department: department._id }),
        active: await Lecturer.countDocuments({
          department: department._id,
          user: { $in: await User.find({ isActive: true }).select('_id') }
        })
      },
      courses: {
        total: await Course.countDocuments({ department: department._id }),
        bySemester: await Course.aggregate([
          { $match: { department: department._id } },
          { $group: { _id: '$semester', count: { $sum: 1 } } },
          { $sort: { _id: 1 } }
        ]),
        byLevel: await Course.aggregate([
          { $match: { department: department._id } },
          { $group: { _id: '$level', count: { $sum: 1 } } },
          { $sort: { _id: 1 } }
        ])
      }
    };
    
    // Get recent activities - like recent course creations, lecturer assignments, etc.
    const recentCourses = await Course.find({ department: department._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('code title level semester createdAt')
      .populate({ 
        path: 'lecturer', 
        select: 'user',
        populate: { path: 'user', select: 'fullName' } 
      });
    
    // Get lecturers with their courses
    const lecturers = await Lecturer.find({ department: department._id })
      .populate('user', 'fullName email isActive')
      .populate('courses', 'code title')
      .limit(10);
    
    res.status(200).json({
      success: true,
      data: {
        department,
        stats,
        recentCourses,
        lecturers
      }
    });
  } catch (error) {
    console.error('Error getting department details:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting department details',
      error: error.message
    });
  }
};
/**
 * @desc    Get all courses
 * @route   GET /api/admin/courses
 * @access  Private/Admin
 */
exports.getAllCourses = async (req, res) => {
  try {
    const {
      search,
      department,
      level,
      semester,
      academicSession,
      hasLecturer,
      page = 1,
      limit = 50,
      sortBy = 'code',
      sortOrder = 'asc'
    } = req.query;
    
    // Build query
    const query = {};
    
    if (search) {
      query.$or = [
        { code: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (department) {
      query.department = department;
    }
    
    if (level) {
      query.level = parseInt(level);
    }
    
    if (semester) {
      query.semester = parseInt(semester);
    }
    
    if (academicSession) {
      query.academicSession = academicSession;
    }
    
    if (hasLecturer !== undefined) {
      if (hasLecturer === 'true') {
        query.lecturer = { $exists: true, $ne: null };
      } else {
        query.$or = [
          { lecturer: { $exists: false } },
          { lecturer: null }
        ];
      }
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Prepare sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Get courses with pagination
    const courses = await Course.find(query)
      .populate('department', 'name code')
      .populate('academicSession', 'name year semester')
      .populate({
        path: 'lecturer',
        populate: {
          path: 'user',
          select: 'fullName email'
        }
      })
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await Course.countDocuments(query);
    
    // Get statistics
    const stats = {
      total: await Course.countDocuments(),
      byDepartment: await Course.aggregate([
        {
          $lookup: {
            from: 'departments',
            localField: 'department',
            foreignField: '_id',
            as: 'departmentInfo'
          }
        },
        {
          $unwind: '$departmentInfo'
        },
        {
          $group: {
            _id: '$department',
            departmentName: { $first: '$departmentInfo.name' },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        },
        {
          $limit: 10
        }
      ]),
      byLevel: await Course.aggregate([
        {
          $group: {
            _id: '$level',
            count: { $sum: 1 }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]),
      bySemester: await Course.aggregate([
        {
          $group: {
            _id: '$semester',
            count: { $sum: 1 }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]),
      withLecturer: await Course.countDocuments({ lecturer: { $exists: true, $ne: null } }),
      withoutLecturer: await Course.countDocuments({
        $or: [
          { lecturer: { $exists: false } },
          { lecturer: null }
        ]
      })
    };
    
    res.status(200).json({
      success: true,
      count: courses.length,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      },
      stats,
      data: courses
    });
  } catch (error) {
    console.error('Error getting courses:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting courses',
      error: error.message
    });
  }
};

/**
 * @desc    Create a new course
 * @route   POST /api/admin/courses
 * @access  Private/Admin
 */
/**
 * @desc    Create a new course
 * @route   POST /api/admin/courses
 * @access  Private/Admin
 */
// @desc    Create a new course
// @route   POST /api/admin/courses
// @access  Private/Admin
// @desc    Create a new course
// @route   POST /api/admin/courses
// @access  Private/Admin
exports.createCourse = async (req, res) => {
  try {
    const { 
      title, 
      code, 
      description, 
      department, 
      level, 
      credits, 
      semester,
      academicSession: academicSessionId,
      isCompulsory = false,
      lecturerId 
    } = req.body;

    console.log('Course creation request body:', req.body);

    // Validate required fields
    if (!title || !code || !level) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title, code, and level'
      });
    }

    // Check if department is missing or empty
    if (!department) {
      return res.status(400).json({
        success: false,
        message: 'Department is required'
      });
    }

    // Check if course code already exists
    const existingCourse = await Course.findOne({ code });
    if (existingCourse) {
      return res.status(400).json({
        success: false,
        message: 'Course with this code already exists'
      });
    }

    // Find department by ID or name
    let departmentId;
    
    // If department is a string (not an ObjectId), try to find by name
    if (typeof department === 'string' && !mongoose.Types.ObjectId.isValid(department)) {
      console.log('Looking up department by name:', department);
      
      const departmentDoc = await Department.findOne({
        name: { $regex: new RegExp(`^${department}$`, 'i') }
      });

      if (!departmentDoc) {
        return res.status(404).json({
          success: false,
          message: `Department "${department}" not found. Please check the department name.`
        });
      }

      console.log('Found department:', departmentDoc.name, 'with ID:', departmentDoc._id);
      departmentId = departmentDoc._id;
    } else {
      // If it's already an ObjectId or a string representation of one
      departmentId = department;
    }

    // Find active academic session if none provided
    let academicSession = academicSessionId;
    if (!academicSession) {
      const activeSession = await AcademicSession.findOne({ isActive: true });
      if (!activeSession) {
        return res.status(400).json({
          success: false,
          message: 'No active academic session found. Please create one before adding courses.'
        });
      }
      academicSession = activeSession._id;
    }

    // Normalize semester value
    let normalizedSemester = semester;
    if (semester) {
      const semValue = semester.toString().toLowerCase();
      if (semValue === '1' || semValue === 'first') {
        normalizedSemester = 'First';
      } else if (semValue === '2' || semValue === 'second') {
        normalizedSemester = 'Second';
      }
    }

    // Create course data object
    const courseData = {
      title,
      code,
      description,
      department: departmentId, // Use the found department ID
      level,
      credits: credits || 3,
      semester: normalizedSemester || 'First',
      academicSession,
      isCompulsory: isCompulsory === true
    };

    // Only add lecturer if provided
    if (lecturerId) {
      if (Array.isArray(lecturerId)) {
        courseData.lecturer = lecturerId;
      } else {
        courseData.lecturer = [lecturerId];
      }
    }

    console.log('Creating course with data:', {
      ...courseData,
      department: departmentId.toString() // Convert ObjectId to string for logging
    });

    // Create the course
    const course = await Course.create(courseData);

    // If course is compulsory, auto-assign to matching students
    if (isCompulsory) {
      const students = await Student.find({ 
        department: departmentId,
        level
      });
      
      for (const student of students) {
        student.courses.push(course._id);
        await student.save();
      }
      
      console.log(`Auto-assigned course ${course._id} to ${students.length} students`);
    }

    // Populate the course to show department name in response
    const populatedCourse = await Course.findById(course._id)
      .populate('department', 'name code')
      .populate('academicSession', 'name year');

    res.status(201).json({
      success: true,
      data: populatedCourse
    });
  } catch (error) {
    console.error('Error creating course:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating course',
      error: error.message
    });
  }
};
/**
 * @desc    Create multiple courses at once
 * @route   POST /api/admin/courses/bulk
 * @access  Private/Admin
 */
exports.createCoursesBulk = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { courses, defaultAcademicSession } = req.body;
    
    if (!courses || !Array.isArray(courses) || courses.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of courses'
      });
    }
    
    const results = {
      successful: [],
      failed: []
    };
    
    // Check if academic session exists if provided
    let academicSessionId = null;
    if (defaultAcademicSession) {
      const sessionExists = await AcademicSession.findById(defaultAcademicSession);
      if (sessionExists) {
        academicSessionId = defaultAcademicSession;
      }
    }
    
    // Process each course
    for (const courseData of courses) {
      try {
        const {
          code,
          title,
          description,
          department,
          credits,
          level,
          semester,
          isElective,
          academicSession,
          lecturer,
          prerequisites
        } = courseData;
        
        // Validate required fields
        if (!code || !title || !department || !level || !semester) {
          results.failed.push({
            course: courseData,
            error: 'Missing required fields (code, title, department, level, semester)'
          });
          continue;
        }
        
        // Check if course already exists with same code
        const existingCourse = await Course.findOne({
          code: { $regex: new RegExp(`^${code}$`, 'i') },
          department
        }).session(session);
        
        if (existingCourse) {
          results.failed.push({
            course: courseData,
            error: 'Course with this code already exists in this department'
          });
          continue;
        }
        
        // Check if department exists
        const departmentExists = await Department.findById(department).session(session);
        if (!departmentExists) {
          results.failed.push({
            course: courseData,
            error: 'Department not found'
          });
          continue;
        }
        
        // Determine academic session
        const sessionId = academicSession || academicSessionId;
        
        // Check if lecturer exists if provided
        let lecturerId = null;
        if (lecturer) {
          const lecturerExists = await Lecturer.findById(lecturer).session(session);
          if (!lecturerExists) {
            results.failed.push({
              course: courseData,
              error: 'Lecturer not found'
            });
            continue;
          }
          lecturerId = lecturer;
        }
        
        // Create course
        const course = await Course.create([{
          code,
          title,
          description: description || '',
          department,
          credits: credits || 3,
          level: parseInt(level),
          semester: parseInt(semester),
          isElective: isElective || false,
          academicSession: sessionId,
          lecturer: lecturerId,
          prerequisites: prerequisites || []
        }], { session });
        
        // Add course to lecturer if provided
        if (lecturerId) {
          await Lecturer.findByIdAndUpdate(
            lecturerId,
            { $addToSet: { courses: course[0]._id } },
            { session }
          );
        }
        
        results.successful.push({
          _id: course[0]._id,
          code,
          title,
          department
        });
      } catch (error) {
        results.failed.push({
          course: courseData,
          error: error.message
        });
      }
    }
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(200).json({
      success: true,
      message: `Created ${results.successful.length} courses, failed ${results.failed.length}`,
      data: results
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error creating bulk courses:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating bulk courses',
      error: error.message
    });
  }
};

/**
 * @desc    Update a course
 * @route   PUT /api/admin/courses/:id
 * @access  Private/Admin
 */
/**
 * @desc    Update a course
 * @route   PUT /api/admin/courses/:id
 * @access  Private/Admin
 */
exports.updateCourse = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    
    // Find course
    const course = await Course.findById(id);
    if (!course) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Handle department if provided as a name instead of ID
    if (updateData.department && typeof updateData.department === 'string' && 
        !mongoose.Types.ObjectId.isValid(updateData.department)) {
      
      console.log(`Looking up department by name: ${updateData.department}`);
      
      const departmentDoc = await Department.findOne({
        name: { $regex: new RegExp(`^${updateData.department}$`, 'i') }
      });

      if (!departmentDoc) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: `Department "${updateData.department}" not found. Please check the department name.`
        });
      }

      console.log(`Found department: ${departmentDoc.name} with ID: ${departmentDoc._id}`);
      updateData.department = departmentDoc._id;
    }
    
    // Handle semester normalization if provided
    if (updateData.semester) {
      const semValue = updateData.semester.toString().toLowerCase();
      if (semValue === '1' || semValue === 'first') {
        updateData.semester = 'First';
      } else if (semValue === '2' || semValue === 'second') {
        updateData.semester = 'Second';
      }
    }
    
    // Update lecturer assignments if lecturer is changing
    if (updateData.lecturer && (!course.lecturer || 
        updateData.lecturer.toString() !== course.lecturer.toString())) {
      
      // Remove course from old lecturer if exists
      if (course.lecturer) {
        await Lecturer.findByIdAndUpdate(
          course.lecturer,
          { $pull: { courses: id } },
          { session }
        );
      }
      
      // Add course to new lecturer
      await Lecturer.findByIdAndUpdate(
        updateData.lecturer,
        { $addToSet: { courses: id } },
        { session }
      );
    }
    
    // If isCompulsory is changing from false to true, handle auto-enrollment
    if (updateData.isCompulsory === true && !course.isCompulsory) {
      const departmentId = updateData.department || course.department;
      const level = updateData.level || course.level;
      
      const students = await Student.find({ 
        department: departmentId,
        level
      });
      
      for (const student of students) {
        // Only add if not already present
        if (!student.courses.includes(id) && 
            !student.courses.some(c => c.toString() === id.toString())) {
          student.courses.push(id);
          await student.save({ session });
        }
      }
      
      console.log(`Auto-assigned course ${id} to ${students.length} students`);
    }
    
    // Find and update the course
    const updatedCourse = await Course.findByIdAndUpdate(
      id,
      updateData,
      { 
        new: true,
        session,
        runValidators: true
      }
    ).populate('department academicSession lecturer');
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(200).json({
      success: true,
      message: 'Course updated successfully',
      data: updatedCourse
    });
  } catch (error) {
    // Only abort if the transaction is still active
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    
    console.error('Error updating course:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating course',
      error: error.message
    });
  }
};

/**
 * @desc    Delete a course
 * @route   DELETE /api/admin/courses/:id
 * @access  Private/Admin
 */
exports.deleteCourse = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    
    // Find course
    const course = await Course.findById(id)
      .populate('department', 'name')
      .populate('academicSession', 'name');
      
    if (!course) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Check if course has enrollments
    const enrollmentsCount = await Enrollment.countDocuments({ course: id });
    if (enrollmentsCount > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Cannot delete course with existing enrollments',
        data: {
          enrollmentsCount,
          courseCode: course.code,
          courseTitle: course.title
        }
      });
    }
    
    // Check if course is a prerequisite for other courses
    const prerequiredForCount = await Course.countDocuments({ prerequisites: id });
    if (prerequiredForCount > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Cannot delete course that is a prerequisite for other courses',
        data: {
          prerequiredForCount,
          courseInfo: {
            code: course.code,
            title: course.title
          }
        }
      });
    }
    
    // Remove course from student course lists
    await Student.updateMany(
      { courses: id },
      { $pull: { courses: id } },
      { session }
    );
    
    // Remove course from lecturer's courses if assigned
    if (course.lecturer) {
      if (Array.isArray(course.lecturer)) {
        // Handle multiple lecturers case
        for (const lecturerId of course.lecturer) {
          await Lecturer.findByIdAndUpdate(
            lecturerId,
            { $pull: { courses: id } },
            { session }
          );
        }
      } else {
        // Handle single lecturer case
        await Lecturer.findByIdAndUpdate(
          course.lecturer,
          { $pull: { courses: id } },
          { session }
        );
      }
    }
    
    // Delete all related resources, assignments, etc.
    await Promise.all([
      // Delete course schedules
      Schedule.deleteMany({ course: id }, { session }),
      
      // Delete resources tied to this course
      Resource.deleteMany({ course: id }, { session }),
      
      // Delete assignments for this course
      Assignment.deleteMany({ course: id }, { session }),
    ]);
    
    // Delete the course record
    await Course.findByIdAndDelete(id, { session });
    
    // Log this deletion
    await SystemActivity.create([{
      user: req.user.id,
      action: 'COURSE_DELETE',
      details: `Deleted course ${course.code} (${course.title})`,
      affectedModel: 'Course',
      affectedId: id
    }], { session });
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(200).json({
      success: true,
      message: 'Course deleted successfully',
      data: { 
        id,
        code: course.code,
        title: course.title,
        department: course.department?.name || 'Unknown Department'
      }
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    
    console.error('Error deleting course:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting course',
      error: error.message
    });
  }
};

/**
 * @desc    Get courses by department
 * @route   GET /api/admin/courses/department/:departmentName
 * @access  Private/Admin
 */
exports.getCoursesByDepartment = async (req, res) => {
  try {
    const { departmentName } = req.params;
    const {
      level,
      semester,
      academicSession,
      hasLecturer,
      page = 1,
      limit = 50
    } = req.query;
    
    // Find department
    const department = await Department.findOne({
      name: { $regex: new RegExp(`^${departmentName}$`, 'i') }
    });
    
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }
    
    // Build query
    const query = { department: department._id };
    
    if (level) {
      query.level = parseInt(level);
    }
    
    if (semester) {
      query.semester = parseInt(semester);
    }
    
    if (academicSession) {
      query.academicSession = academicSession;
    }
    
    if (hasLecturer !== undefined) {
      if (hasLecturer === 'true') {
        query.lecturer = { $exists: true, $ne: null };
      } else {
        query.$or = [
          { lecturer: { $exists: false } },
          { lecturer: null }
        ];
      }
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get courses with pagination
    const courses = await Course.find(query)
      .populate('academicSession', 'name year semester')
      .populate({
        path: 'lecturer',
        populate: {
          path: 'user',
          select: 'fullName email'
        }
      })
      .sort({ code: 1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await Course.countDocuments(query);
    
    // Get statistics
    const stats = {
      total: await Course.countDocuments({ department: department._id }),
      byLevel: await Course.aggregate([
        { $match: { department: department._id } },
        { $group: { _id: '$level', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      bySemester: await Course.aggregate([
        { $match: { department: department._id } },
        { $group: { _id: '$semester', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      withLecturer: await Course.countDocuments({
        department: department._id,
        lecturer: { $exists: true, $ne: null }
      }),
      withoutLecturer: await Course.countDocuments({
        department: department._id,
        $or: [
          { lecturer: { $exists: false } },
          { lecturer: null }
        ]
      })
    };
    
    res.status(200).json({
      success: true,
      count: courses.length,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      },
      data: {
        department,
        stats,
        courses
      }
    });
  } catch (error) {
    console.error('Error getting courses by department:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting courses by department',
      error: error.message
    });
  }
};

/**
 * @desc    Get courses by academic session
 * @route   GET /api/admin/courses/session/:sessionId
 * @access  Private/Admin
 */
exports.getCoursesBySession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const {
      department,
      level,
      semester,
      page = 1,
      limit = 50
    } = req.query;
    
    // Find session
    const session = await AcademicSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Academic session not found'
      });
    }
    
    // Build query
    const query = { academicSession: sessionId };
    
    if (department) {
      query.department = department;
    }
    
    if (level) {
      query.level = parseInt(level);
    }
    
    if (semester) {
      query.semester = parseInt(semester);
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get courses with pagination
    const courses = await Course.find(query)
      .populate('department', 'name code')
      .populate({
        path: 'lecturer',
        populate: {
          path: 'user',
          select: 'fullName email'
        }
      })
      .sort({ department: 1, level: 1, semester: 1, code: 1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await Course.countDocuments(query);
    
    // Get statistics
    const stats = {
      total: await Course.countDocuments({ academicSession: sessionId }),
      byDepartment: await Course.aggregate([
        { $match: { academicSession: mongoose.Types.ObjectId(sessionId) } },
        {
          $lookup: {
            from: 'departments',
            localField: 'department',
            foreignField: '_id',
            as: 'departmentInfo'
          }
        },
        { $unwind: '$departmentInfo' },
        { $group: {
            _id: '$department',
            departmentName: { $first: '$departmentInfo.name' },
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]),
      byLevel: await Course.aggregate([
        { $match: { academicSession: mongoose.Types.ObjectId(sessionId) } },
        { $group: { _id: '$level', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      bySemester: await Course.aggregate([
        { $match: { academicSession: mongoose.Types.ObjectId(sessionId) } },
        { $group: { _id: '$semester', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ])
    };
    
    res.status(200).json({
      success: true,
      count: courses.length,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      },
      data: {
        academicSession: session,
        stats,
        courses
      }
    });
  } catch (error) {
    console.error('Error getting courses by session:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting courses by session',
      error: error.message
    });
  }
};

/**
 * @desc    Batch update multiple courses
 * @route   PATCH /api/admin/courses/batch
 * @access  Private/Admin
 */
// Modified batchUpdateCourses to handle update-by-course format
exports.batchUpdateCourses = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Check if updates array is provided
    const { updates } = req.body;
    
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of updates'
      });
    }
    
    const results = {
      successful: [],
      failed: []
    };
    
    // Process each update
    for (const updateItem of updates) {
      try {
        const { id, data } = updateItem;
        
        if (!id || !data) {
          results.failed.push({
            update: updateItem,
            error: 'Missing id or data'
          });
          continue;
        }
        
        // Update the course
        const updatedCourse = await Course.findByIdAndUpdate(
          id,
          { $set: data },
          { new: true, session, runValidators: true }
        );
        
        if (!updatedCourse) {
          results.failed.push({
            update: updateItem,
            error: 'Course not found'
          });
          continue;
        }
        
        results.successful.push({
          id: updatedCourse._id,
          code: updatedCourse.code,
          title: updatedCourse.title,
          updatedFields: Object.keys(data)
        });
      } catch (error) {
        results.failed.push({
          update: updateItem,
          error: error.message
        });
      }
    }
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(200).json({
      success: true,
      message: `Successfully updated ${results.successful.length} courses, failed ${results.failed.length}`,
      data: results
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    
    console.error('Error batch updating courses:', error);
    res.status(500).json({
      success: false,
      message: 'Error batch updating courses',
      error: error.message
    });
  }
};
/**
 * @desc    Delete all schedules for a course
 * @route   DELETE /api/admin/schedules/course/:courseId
 * @access  Private/Admin
 */
exports.deleteCoursesSchedules = async (req, res) => {
  try {
    const { courseId } = req.params;
    
    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Delete all schedules for the course
    const result = await Schedule.deleteMany({ course: courseId });
    
    res.status(200).json({
      success: true,
      message: `Deleted ${result.deletedCount} schedules for the course`,
      data: {
        courseId,
        deletedCount: result.deletedCount
      }
    });
  } catch (error) {
    console.error('Error deleting course schedules:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting course schedules',
      error: error.message
    });
  }
};
/**
 * @desc    Set an academic session as active
 * @route   PUT /api/admin/academic-sessions/:id/activate
 * @access  Private/Admin
 */
exports.setActiveSession = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    
    // Find academic session
    const academicSession = await AcademicSession.findById(id);
    if (!academicSession) {
      return res.status(404).json({
        success: false,
        message: 'Academic session not found'
      });
    }
    
    // Check if session is already active
    if (academicSession.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Academic session is already active'
      });
    }
    
    // Check if session is archived
    if (academicSession.isArchived) {
      return res.status(400).json({
        success: false,
        message: 'Cannot activate an archived academic session'
      });
    }
    
    // Deactivate current active session
    await AcademicSession.updateMany(
      { isActive: true },
      { isActive: false },
      { session }
    );
    
    // Set this session as active
    academicSession.isActive = true;
    await academicSession.save({ session });
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(200).json({
      success: true,
      message: 'Academic session activated successfully',
      data: academicSession
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error activating academic session:', error);
    res.status(500).json({
      success: false,
      message: 'Error activating academic session',
      error: error.message
    });
  }
};

/**
 * @desc    Archive an academic session
 * @route   PUT /api/admin/academic-sessions/:id/archive
 * @access  Private/Admin
 */
exports.archiveAcademicSession = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find academic session
    const academicSession = await AcademicSession.findById(id);
    if (!academicSession) {
      return res.status(404).json({
        success: false,
        message: 'Academic session not found'
      });
    }
    
    // Check if session is already archived
    if (academicSession.isArchived) {
      return res.status(400).json({
        success: false,
        message: 'Academic session is already archived'
      });
    }
    
    // Check if session is active
    if (academicSession.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Cannot archive an active academic session. Please deactivate it first.'
      });
    }
    
    // Archive the session
    academicSession.isArchived = true;
    await academicSession.save();
    
    res.status(200).json({
      success: true,
      message: 'Academic session archived successfully',
      data: academicSession
    });
  } catch (error) {
    console.error('Error archiving academic session:', error);
    res.status(500).json({
      success: false,
      message: 'Error archiving academic session',
      error: error.message
    });
  }
};

/**
 * @desc    Prepare for transition to a new academic session
 * @route   POST /api/admin/academic-sessions/transition
 * @access  Private/Admin
 */
exports.prepareSessionTransition = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const {
      newSessionId,
      transferCourses,
      transferEnrollments,
      transferLecturerAssignments
    } = req.body;
    
    // Validate required fields
    if (!newSessionId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide newSessionId'
      });
    }
    
    // Find current active session
    const currentSession = await AcademicSession.findOne({ isActive: true });
    if (!currentSession) {
      return res.status(404).json({
        success: false,
        message: 'No active academic session found'
      });
    }
    
    // Find target new session
    const newSession = await AcademicSession.findById(newSessionId);
    if (!newSession) {
      return res.status(404).json({
        success: false,
        message: 'New academic session not found'
      });
    }
    
    // Ensure new session is not already active or archived
    if (newSession.isActive) {
      return res.status(400).json({
        success: false,
        message: 'New session is already active'
      });
    }
    
    if (newSession.isArchived) {
      return res.status(400).json({
        success: false,
        message: 'Cannot transition to an archived session'
      });
    }
    
    // Prepare transition report
    const report = {
      fromSession: {
        id: currentSession._id,
        name: currentSession.name,
        year: currentSession.year,
        semester: currentSession.semester
      },
      toSession: {
        id: newSession._id,
        name: newSession.name,
        year: newSession.year,
        semester: newSession.semester
      },
      courses: {
        transferred: 0,
        total: 0
      },
      enrollments: {
        transferred: 0,
        total: 0
      },
      lecturerAssignments: {
        transferred: 0,
        total: 0
      }
    };
    
    // Transfer courses if requested
    if (transferCourses) {
      // Get all courses from current session
      const currentCourses = await Course.find({ 
        academicSession: currentSession._id 
      });
      
      report.courses.total = currentCourses.length;
      
      if (currentCourses.length > 0) {
        // For each course, create a new version for the new session
        for (const course of currentCourses) {
          // Check if course already exists in new session
          const existingCourse = await Course.findOne({
            code: course.code,
            department: course.department,
            academicSession: newSession._id
          }).session(session);
          
          if (!existingCourse) {
            // Create new course for new session
            await Course.create([{
              code: course.code,
              title: course.title,
              description: course.description,
              department: course.department,
              credits: course.credits,
              level: course.level,
              semester: course.semester,
              isElective: course.isElective,
              academicSession: newSession._id,
              lecturer: transferLecturerAssignments ? course.lecturer : null,
              prerequisites: course.prerequisites,
              isActive: true
            }], { session });
            
            report.courses.transferred++;
            
            // Update lecturer assignments if requested
            if (transferLecturerAssignments && course.lecturer) {
              report.lecturerAssignments.total++;
              report.lecturerAssignments.transferred++;
            }
          }
        }
      }
    }
    
    // Transfer enrollments if requested
    if (transferEnrollments && transferCourses) {
      // This is a complex operation that would need to be tailored to your specific enrollment model and business logic
      // For example, determining which students should be enrolled in which courses in the new session
      // The implementation would depend on your exact requirements
      
      // This is a simplified version that assumes you want to carry forward all enrollments
      // from current active courses to their corresponding new courses
      const currentEnrollments = await Enrollment.find({
        course: { 
          $in: await Course.find({ academicSession: currentSession._id }).select('_id') 
        },
        status: 'approved' // Only transfer approved enrollments
      });
      
      report.enrollments.total = currentEnrollments.length;
      
      for (const enrollment of currentEnrollments) {
        // Find the original course
        const originalCourse = await Course.findById(enrollment.course);
        
        if (originalCourse) {
          // Find corresponding course in new session
          const newCourse = await Course.findOne({
            code: originalCourse.code,
            department: originalCourse.department,
            academicSession: newSession._id
          }).session(session);
          
          if (newCourse) {
            // Check if student is already enrolled in the new course
            const existingEnrollment = await Enrollment.findOne({
              student: enrollment.student,
              course: newCourse._id
            }).session(session);
            
            if (!existingEnrollment) {
              // Create new enrollment
              await Enrollment.create([{
                student: enrollment.student,
                course: newCourse._id,
                enrollmentDate: new Date(),
                status: 'approved', // Auto-approve carried-forward enrollments
                notes: `Transferred from ${currentSession.name}`
              }], { session });
              
              report.enrollments.transferred++;
            }
          }
        }
      }
    }
    
    // Deactivate current session and activate new session
    currentSession.isActive = false;
    newSession.isActive = true;
    
    await currentSession.save({ session });
    await newSession.save({ session });
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(200).json({
      success: true,
      message: 'Session transition completed successfully',
      data: {
        previousSession: currentSession,
        newActiveSession: newSession,
        transitionReport: report
      }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error during session transition:', error);
    res.status(500).json({
      success: false,
      message: 'Error during session transition',
      error: error.message
    });
  }
};

/**
 * @desc    Get all academic sessions
 * @route   GET /api/admin/academic-sessions
 * @access  Private/Admin
 */
exports.getAllAcademicSessions = async (req, res) => {
  try {
    const {
      search,
      isActive,
      isArchived,
      sortBy = 'year',
      sortOrder = 'desc',
      page = 1,
      limit = 20
    } = req.query;
    
    // Build query
    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { year: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (isArchived !== undefined) {
      query.isArchived = isArchived === 'true';
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Prepare sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Get academic sessions with pagination
    const academicSessions = await AcademicSession.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await AcademicSession.countDocuments(query);
    
    // Add statistics for each session
    const sessionsWithStats = await Promise.all(academicSessions.map(async session => {
      const coursesCount = await Course.countDocuments({ academicSession: session._id });
      const enrollmentsCount = await Enrollment.countDocuments({ 
        course: { $in: await Course.find({ academicSession: session._id }).select('_id') } 
      });
      const timetablesCount = await ExamTimetable.countDocuments({ academicSession: session._id });
      
      return {
        ...session.toObject(),
        stats: {
          courses: coursesCount,
          enrollments: enrollmentsCount,
          timetables: timetablesCount
        }
      };
    }));
    
    // Get overall stats
    const stats = {
      total: await AcademicSession.countDocuments(),
      active: await AcademicSession.countDocuments({ isActive: true }),
      archived: await AcademicSession.countDocuments({ isArchived: true }),
      byYear: await AcademicSession.aggregate([
        { $group: { _id: '$year', count: { $sum: 1 } } },
        { $sort: { _id: -1 } }
      ])
    };
    
    res.status(200).json({
      success: true,
      count: academicSessions.length,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      },
      stats,
      data: sessionsWithStats
    });
  } catch (error) {
    console.error('Error getting academic sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting academic sessions',
      error: error.message
    });
  }
};

/**
 * @desc    Create a new academic session
 * @route   POST /api/admin/academic-sessions
 * @access  Private/Admin
 */
exports.createAcademicSession = async (req, res) => {
  try {
    const {
      name,
      year,
      semester,
      startDate,
      endDate,
      registrationStartDate,
      registrationEndDate,
      description,
      isActive
    } = req.body;
    
    // Validate required fields
    if (!name || !year || !semester || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, year, semester, start date, and end date'
      });
    }
    
    // Check if academic session with same name or year/semester combination already exists
    const existingSession = await AcademicSession.findOne({
      $or: [
        { name: { $regex: new RegExp(`^${name}$`, 'i') } },
        {
          year,
          semester: parseInt(semester)
        }
      ]
    });
    
    if (existingSession) {
      return res.status(400).json({
        success: false,
        message: 'Academic session with this name or year/semester combination already exists'
      });
    }
    
    // If setting this session as active, deactivate all other sessions
    if (isActive) {
      await AcademicSession.updateMany(
        { isActive: true },
        { isActive: false }
      );
    }
    
    // Create academic session
    const academicSession = await AcademicSession.create({
      name,
      year,
      semester: parseInt(semester),
      startDate,
      endDate,
      registrationStartDate: registrationStartDate || startDate,
      registrationEndDate: registrationEndDate || startDate,
      description: description || '',
      isActive: isActive || false,
      isArchived: false
    });
    
    res.status(201).json({
      success: true,
      message: 'Academic session created successfully',
      data: academicSession
    });
  } catch (error) {
    console.error('Error creating academic session:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating academic session',
      error: error.message
    });
  }
};

/**
 * @desc    Update an academic session
 * @route   PUT /api/admin/academic-sessions/:id
 * @access  Private/Admin
 */
exports.updateAcademicSession = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      year,
      semester,
      startDate,
      endDate,
      registrationStartDate,
      registrationEndDate,
      description,
      isActive
    } = req.body;
    
    // Find academic session
    const academicSession = await AcademicSession.findById(id);
    if (!academicSession) {
      return res.status(404).json({
        success: false,
        message: 'Academic session not found'
      });
    }
    
    // Check if name or year/semester is being changed and already exists
    if ((name && name !== academicSession.name) || 
        (year && year !== academicSession.year) || 
        (semester && parseInt(semester) !== academicSession.semester)) {
      
      const existingSession = await AcademicSession.findOne({
        _id: { $ne: id },
        $or: [
          { name: { $regex: new RegExp(`^${name || academicSession.name}$`, 'i') } },
          {
            year: year || academicSession.year,
            semester: semester ? parseInt(semester) : academicSession.semester
          }
        ]
      });
      
      if (existingSession) {
        return res.status(400).json({
          success: false,
          message: 'Academic session with this name or year/semester combination already exists'
        });
      }
    }
    
    // Check if dates make sense
    const start = startDate ? new Date(startDate) : academicSession.startDate;
    const end = endDate ? new Date(endDate) : academicSession.endDate;
    const regStart = registrationStartDate ? new Date(registrationStartDate) : academicSession.registrationStartDate;
    const regEnd = registrationEndDate ? new Date(registrationEndDate) : academicSession.registrationEndDate;
    
    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'Start date must be before end date'
      });
    }
    
    if (regStart > regEnd) {
      return res.status(400).json({
        success: false,
        message: 'Registration start date must be before registration end date'
      });
    }
    
    // If setting this session as active, deactivate all other sessions
    if (isActive && !academicSession.isActive) {
      await AcademicSession.updateMany(
        { isActive: true },
        { isActive: false }
      );
    }
    
    // Update academic session
    const updatedSession = await AcademicSession.findByIdAndUpdate(
      id,
      {
        name: name || academicSession.name,
        year: year || academicSession.year,
        semester: semester ? parseInt(semester) : academicSession.semester,
        startDate: start,
        endDate: end,
        registrationStartDate: regStart,
        registrationEndDate: regEnd,
        description: description !== undefined ? description : academicSession.description,
        isActive: isActive !== undefined ? isActive : academicSession.isActive
      },
      { new: true }
    );
    
    res.status(200).json({
      success: true,
      message: 'Academic session updated successfully',
      data: updatedSession
    });
  } catch (error) {
    console.error('Error updating academic session:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating academic session',
      error: error.message
    });
  }
};

/**
 * @desc    Delete an academic session
 * @route   DELETE /api/admin/academic-sessions/:id
 * @access  Private/Admin
 */
exports.deleteAcademicSession = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    
    // Find academic session
    const academicSession = await AcademicSession.findById(id);
    if (!academicSession) {
      return res.status(404).json({
        success: false,
        message: 'Academic session not found'
      });
    }
    
    // Check if academic session is currently active
    if (academicSession.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete an active academic session. Please deactivate it first.'
      });
    }
    
    // Check if there are courses associated with this session
    const coursesCount = await Course.countDocuments({ academicSession: id });
    if (coursesCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete academic session with associated courses',
        data: {
          coursesCount
        }
      });
    }
    
    // Check if there are exam timetables associated with this session
    const timetablesCount = await ExamTimetable.countDocuments({ academicSession: id });
    if (timetablesCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete academic session with associated exam timetables',
        data: {
          timetablesCount
        }
      });
    }
    
    // Delete academic session
    await AcademicSession.findByIdAndDelete(id, { session });
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(200).json({
      success: true,
      message: 'Academic session deleted successfully',
      data: { id }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error deleting academic session:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting academic session',
      error: error.message
    });
  }
};
/**
 * @desc    Get admin dashboard statistics
 * @route   GET /api/admin/dashboard
 * @access  Private/Admin
 */
exports.getDashboardStats = async (req, res) => {
  try {
    // Get counts for each entity
    const userStats = {
      total: await User.countDocuments(),
      active: await User.countDocuments({ isActive: true }),
      admins: await User.countDocuments({ role: 'admin' }),
      students: await User.countDocuments({ role: 'student' }),
      lecturers: await User.countDocuments({ role: 'lecturer' }),
      recentlyJoined: await User.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('fullName email role createdAt')
    };

    // Get department stats
    const departmentStats = {
      total: await Department.countDocuments(),
      byFaculty: await Department.aggregate([
        {
          $lookup: {
            from: 'faculties',
            localField: 'faculty',
            foreignField: '_id',
            as: 'facultyInfo'
          }
        },
        {
          $unwind: {
            path: '$facultyInfo',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $group: {
            _id: '$faculty',
            name: { $first: { $ifNull: ['$facultyInfo.name', 'No Faculty'] } },
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ])
    };

    // Get course stats
    const courseStats = {
      total: await Course.countDocuments(),
      active: await Course.countDocuments({ isActive: true }),
      byDepartment: await Course.aggregate([
        {
          $lookup: {
            from: 'departments',
            localField: 'department',
            foreignField: '_id',
            as: 'departmentInfo'
          }
        },
        { $unwind: '$departmentInfo' },
        {
          $group: {
            _id: '$department',
            departmentName: { $first: '$departmentInfo.name' },
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]),
      bySemester: await Course.aggregate([
        { $group: { _id: '$semester', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      byLevel: await Course.aggregate([
        { $group: { _id: '$level', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      recentlyAdded: await Course.find()
        .populate('department', 'name')
        .sort({ createdAt: -1 })
        .limit(5)
        .select('code title department createdAt')
    };

    // Get enrollment stats
    const enrollmentStats = {
      total: await Enrollment.countDocuments(),
      pending: await Enrollment.countDocuments({ status: 'pending' }),
      approved: await Enrollment.countDocuments({ status: 'approved' }),
      rejected: await Enrollment.countDocuments({ status: 'rejected' }),
      byDepartment: await Student.aggregate([
        {
          $lookup: {
            from: 'departments',
            localField: 'department',
            foreignField: '_id',
            as: 'departmentInfo'
          }
        },
        { $unwind: '$departmentInfo' },
        {
          $lookup: {
            from: 'enrollments',
            localField: '_id',
            foreignField: 'student',
            as: 'enrollments'
          }
        },
        {
          $group: {
            _id: '$department',
            departmentName: { $first: '$departmentInfo.name' },
            count: { $sum: { $size: '$enrollments' } }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]),
      recentEnrollments: await Enrollment.find()
        .populate('student', 'matricNumber')
        .populate({
          path: 'course',
          select: 'code title',
          populate: { path: 'department', select: 'name' }
        })
        .sort({ enrollmentDate: -1 })
        .limit(5)
    };

    // Get academic session info
    const activeSession = await AcademicSession.findOne({ isActive: true });
    const sessionData = activeSession ? {
      id: activeSession._id,
      name: activeSession.name,
      year: activeSession.year,
      semester: activeSession.semester,
      startDate: activeSession.startDate,
      endDate: activeSession.endDate,
      registrationStatus: new Date() >= activeSession.registrationStartDate && 
                         new Date() <= activeSession.registrationEndDate ? 'open' : 'closed',
      daysRemaining: Math.max(0, Math.ceil((activeSession.endDate - new Date()) / (1000 * 60 * 60 * 24)))
    } : null;

    // Get system activity
    const recentActivity = await SystemActivity.find()
      .populate('user', 'fullName role')
      .sort({ timestamp: -1 })
      .limit(10);

    // Get announcement stats
    const announcementStats = {
      total: await Announcement.countDocuments(),
      active: await Announcement.countDocuments({ isActive: true }),
      recent: await Announcement.find()
        .sort({ createdAt: -1 })
        .limit(3)
    };

    // Get schedule stats
    const scheduleStats = {
      total: await Schedule.countDocuments(),
      today: await Schedule.countDocuments({
        day: new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
      }),
      byCourse: await Schedule.aggregate([
        {
          $lookup: {
            from: 'courses',
            localField: 'course',
            foreignField: '_id',
            as: 'courseInfo'
          }
        },
        { $unwind: '$courseInfo' },
        {
          $group: {
            _id: '$course',
            courseCode: { $first: '$courseInfo.code' },
            courseTitle: { $first: '$courseInfo.title' },
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ])
    };

    res.status(200).json({
      success: true,
      data: {
        activeSession: sessionData,
        users: userStats,
        departments: departmentStats,
        courses: courseStats,
        enrollments: enrollmentStats,
        announcements: announcementStats,
        schedules: scheduleStats,
        recentActivity
      }
    });
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting dashboard statistics',
      error: error.message
    });
  }
};

/**
 * @desc    Get system settings
 * @route   GET /api/admin/settings
 * @access  Private/Admin
 */
exports.getSystemSettings = async (req, res) => {
  try {
    // Get or create system settings
    let settings = await SystemSettings.findOne();
    
    if (!settings) {
      // Create default settings if none exist
      settings = await SystemSettings.create({
        systemName: 'GemSpace',
        academicYear: new Date().getFullYear().toString(),
        enrollmentSettings: {
          requireApproval: true,
          maxCoursesPerStudent: 10,
          allowLateEnrollment: false
        },
        emailSettings: {
          sendWelcomeEmail: true,
          sendEnrollmentNotifications: true,
          adminEmailAddress: 'admin@example.com'
        },
        uiSettings: {
          primaryColor: '#3f51b5',
          logoUrl: '/assets/logo.png',
          favicon: '/assets/favicon.ico'
        },
        maintenanceMode: false,
        version: '1.0.0'
      });
    }
    
    res.status(200).json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Error getting system settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting system settings',
      error: error.message
    });
  }
};

/**
 * @desc    Update system settings
 * @route   PUT /api/admin/settings
 * @access  Private/Admin
 */
exports.updateSystemSettings = async (req, res) => {
  try {
    const {
      systemName,
      academicYear,
      enrollmentSettings,
      emailSettings,
      uiSettings,
      maintenanceMode
    } = req.body;
    
    // Get current settings
    let settings = await SystemSettings.findOne();
    
    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'System settings not found'
      });
    }
    
    // Update settings
    const updatedSettings = await SystemSettings.findByIdAndUpdate(
      settings._id,
      {
        systemName: systemName || settings.systemName,
        academicYear: academicYear || settings.academicYear,
        enrollmentSettings: enrollmentSettings ? {
          ...settings.enrollmentSettings,
          ...enrollmentSettings
        } : settings.enrollmentSettings,
        emailSettings: emailSettings ? {
          ...settings.emailSettings,
          ...emailSettings
        } : settings.emailSettings,
        uiSettings: uiSettings ? {
          ...settings.uiSettings,
          ...uiSettings
        } : settings.uiSettings,
        maintenanceMode: maintenanceMode !== undefined ? maintenanceMode : settings.maintenanceMode,
        updatedAt: Date.now()
      },
      { new: true }
    );
    
    // Log the settings change
    await SystemActivity.create({
      user: req.user._id,
      activity: 'update_settings',
      description: 'Updated system settings',
      details: {
        changes: req.body
      }
    });
    
    res.status(200).json({
      success: true,
      message: 'System settings updated successfully',
      data: updatedSettings
    });
  } catch (error) {
    console.error('Error updating system settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating system settings',
      error: error.message
    });
  }
};

/**
 * @desc    Get enrollment statistics
 * @route   GET /api/admin/reports/enrollments
 * @access  Private/Admin
 */
exports.getEnrollmentStats = async (req, res) => {
  try {
    const { 
      department, 
      level, 
      startDate, 
      endDate, 
      academicSession
    } = req.query;
    
    // Build query
    const query = {};
    
    if (startDate && endDate) {
      query.enrollmentDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    // Build student query for filtering
    const studentQuery = {};
    
    if (department) {
      studentQuery.department = department;
    }
    
    if (level) {
      studentQuery.level = parseInt(level);
    }
    
    // Build course query for filtering by academic session
    const courseQuery = {};
    
    if (academicSession) {
      courseQuery.academicSession = academicSession;
    }
    
    // Get filtered student IDs if student filters are applied
    let filteredStudentIds = [];
    if (Object.keys(studentQuery).length > 0) {
      const students = await Student.find(studentQuery).select('_id');
      filteredStudentIds = students.map(student => student._id);
      
      if (filteredStudentIds.length === 0) {
        // No students match the criteria
        return res.status(200).json({
          success: true,
          data: {
            stats: {
              total: 0,
              byStatus: [],
              byDepartment: [],
              byLevel: [],
              byDate: []
            },
            enrollmentsByStatus: {
              approved: [],
              pending: [],
              rejected: []
            }
          }
        });
      }
      
      query.student = { $in: filteredStudentIds };
    }
    
    // Get filtered course IDs if course filters are applied
    if (Object.keys(courseQuery).length > 0) {
      const courses = await Course.find(courseQuery).select('_id');
      const courseIds = courses.map(course => course._id);
      
      if (courseIds.length === 0) {
        // No courses match the criteria
        return res.status(200).json({
          success: true,
          data: {
            stats: {
              total: 0,
              byStatus: [],
              byDepartment: [],
              byLevel: [],
              byDate: []
            },
            enrollmentsByStatus: {
              approved: [],
              pending: [],
              rejected: []
            }
          }
        });
      }
      
      query.course = { $in: courseIds };
    }
    
    // Get total enrollments and enrollments by status
    const total = await Enrollment.countDocuments(query);
    const byStatus = await Enrollment.aggregate([
      { $match: query },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Get enrollments by department
    const byDepartment = await Enrollment.aggregate([
      { $match: query },
      {
        $lookup: {
          from: 'students',
          localField: 'student',
          foreignField: '_id',
          as: 'studentInfo'
        }
      },
      { $unwind: '$studentInfo' },
      {
        $lookup: {
          from: 'departments',
          localField: 'studentInfo.department',
          foreignField: '_id',
          as: 'departmentInfo'
        }
      },
      { $unwind: '$departmentInfo' },
      {
        $group: {
          _id: '$studentInfo.department',
          departmentName: { $first: '$departmentInfo.name' },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    // Get enrollments by level
    const byLevel = await Enrollment.aggregate([
      { $match: query },
      {
        $lookup: {
          from: 'students',
          localField: 'student',
          foreignField: '_id',
          as: 'studentInfo'
        }
      },
      { $unwind: '$studentInfo' },
      {
        $group: {
          _id: '$studentInfo.level',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Get enrollments by date (for chart)
    const byDate = await Enrollment.aggregate([
      { $match: query },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$enrollmentDate' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Get most recent enrollments by status (limited to 5 each)
    const approved = await Enrollment.find({ ...query, status: 'approved' })
      .populate('student', 'matricNumber')
      .populate({
        path: 'course',
        select: 'code title',
        populate: { path: 'department', select: 'name' }
      })
      .sort({ enrollmentDate: -1 })
      .limit(5);
    
    const pending = await Enrollment.find({ ...query, status: 'pending' })
      .populate('student', 'matricNumber')
      .populate({
        path: 'course',
        select: 'code title',
        populate: { path: 'department', select: 'name' }
      })
      .sort({ enrollmentDate: -1 })
      .limit(5);
    
    const rejected = await Enrollment.find({ ...query, status: 'rejected' })
      .populate('student', 'matricNumber')
      .populate({
        path: 'course',
        select: 'code title',
        populate: { path: 'department', select: 'name' }
      })
      .sort({ enrollmentDate: -1 })
      .limit(5);
    
    res.status(200).json({
      success: true,
      data: {
        stats: {
          total,
          byStatus,
          byDepartment,
          byLevel,
          byDate
        },
        enrollmentsByStatus: {
          approved,
          pending,
          rejected
        }
      }
    });
  } catch (error) {
    console.error('Error getting enrollment statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting enrollment statistics',
      error: error.message
    });
  }
};

/**
 * @desc    Get lecturer workload statistics
 * @route   GET /api/admin/reports/lecturer-workload
 * @access  Private/Admin
 */
exports.getLecturerWorkload = async (req, res) => {
  try {
    const { department, academicSession } = req.query;
    
    // Build query
    const query = {};
    
    if (department) {
      query.department = department;
    }
    
    // Get all lecturers based on query
    const lecturers = await Lecturer.find(query)
      .populate('user', 'fullName email isActive')
      .populate('department', 'name');
    
    if (lecturers.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          departmentSummary: [],
          lecturers: []
        }
      });
    }
    
    // Filter courses by academic session if provided
    const courseQuery = {};
    
    if (academicSession) {
      courseQuery.academicSession = academicSession;
    }
    
    // Get workload data for each lecturer
    const lecturerWorkloads = await Promise.all(lecturers.map(async lecturer => {
      // Filter courses based on academic session if needed
      let coursesQuery = { ...courseQuery, _id: { $in: lecturer.courses } };
      
      // Get courses for this lecturer
      const courses = await Course.find(coursesQuery)
        .select('code title credits level semester')
        .populate('academicSession', 'name');
      
      // Calculate total credits
      const totalCredits = courses.reduce((sum, course) => sum + course.credits, 0);
      
      // Get schedule info
      const schedules = await Schedule.find({ lecturer: lecturer._id })
        .populate('course', 'code title');
      
      // Calculate total weekly hours
      const totalHours = schedules.reduce((sum, schedule) => sum + schedule.duration, 0);
      
      // Get level distribution
      const levelDistribution = {};
      courses.forEach(course => {
        levelDistribution[course.level] = (levelDistribution[course.level] || 0) + 1;
      });
      
      return {
        id: lecturer._id,
        name: lecturer.user?.fullName || 'Unknown',
        email: lecturer.user?.email,
        staffId: lecturer.staffId,
        department: lecturer.department?.name || 'Unknown',
        isActive: lecturer.user?.isActive,
        courses: courses.length,
        schedules: schedules.length,
        totalCredits,
        totalHours,
        levelDistribution,
        coursesList: courses.map(course => ({
          id: course._id,
          code: course.code,
          title: course.title,
          credits: course.credits,
          level: course.level,
          semester: course.semester,
          academicSession: course.academicSession?.name
        }))
      };
    }));
    
    // Sort lecturers by workload (number of courses)
    lecturerWorkloads.sort((a, b) => b.courses - a.courses);
    
    // Calculate department averages
    const departmentSummary = await Lecturer.aggregate([
      { $match: query },
      {
        $lookup: {
          from: 'departments',
          localField: 'department',
          foreignField: '_id',
          as: 'departmentInfo'
        }
      },
      { $unwind: '$departmentInfo' },
      {
        $lookup: {
          from: 'courses',
          localField: 'courses',
          foreignField: '_id',
          as: 'coursesList'
        }
      },
      {
        $group: {
          _id: '$department',
          departmentName: { $first: '$departmentInfo.name' },
          lecturers: { $sum: 1 },
          totalCourses: { $sum: { $size: '$coursesList' } },
          avgCourses: { $avg: { $size: '$coursesList' } }
        }
      },
      { $sort: { avgCourses: -1 } }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        departmentSummary,
        lecturers: lecturerWorkloads
      }
    });
  } catch (error) {
    console.error('Error getting lecturer workload:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting lecturer workload',
      error: error.message
    });
  }
};

/**
 * @desc    Create an announcement
 * @route   POST /api/admin/announcements
 * @access  Private/Admin
 */
exports.createAnnouncement = async (req, res) => {
  try {
    const { 
      title, 
      content, 
      targetAudience, 
      department, 
      level, 
      startDate, 
      endDate, 
      isImportant, 
      isActive 
    } = req.body;
    
    // Validate required fields
    if (!title || !content || !targetAudience) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title, content and target audience'
      });
    }
    
    // Validate target audience
    const validAudiences = ['all', 'students', 'lecturers', 'admins', 'specific'];
    if (!validAudiences.includes(targetAudience)) {
      return res.status(400).json({
        success: false,
        message: `Target audience must be one of: ${validAudiences.join(', ')}`
      });
    }
    
    // Check if department exists if specific audience
    if (targetAudience === 'specific' && department) {
      const departmentExists = await Department.findById(department);
      if (!departmentExists) {
        return res.status(404).json({
          success: false,
          message: 'Department not found'
        });
      }
    }
    
    // Create announcement
    const announcement = await Announcement.create({
      title,
      content,
      author: req.user._id,
      targetAudience,
      department: targetAudience === 'specific' ? department : null,
      level: targetAudience === 'specific' && level ? parseInt(level) : null,
      startDate: startDate || Date.now(),
      endDate: endDate || null,
      isImportant: isImportant || false,
      isActive: isActive !== undefined ? isActive : true
    });
    
    // Populate author
    await announcement.populate('author', 'fullName');
    await announcement.populate('department', 'name');
    
    res.status(201).json({
      success: true,
      message: 'Announcement created successfully',
      data: announcement
    });
  } catch (error) {
    console.error('Error creating announcement:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating announcement',
      error: error.message
    });
  }
};
/**
 * @desc    Get all enrollments with filters
 * @route   GET /api/admin/enrollments
 * @access  Private/Admin
 */
exports.getEnrollments = async (req, res) => {
  try {
    const {
      student,
      course,
      status,
      department,
      level,
      academicSession,
      startDate,
      endDate,
      page = 1,
      limit = 50,
      sortBy = 'enrollmentDate',
      sortOrder = 'desc'
    } = req.query;
    
    // Build query
    const query = {};
    
    // Direct enrollment filters
    if (student) {
      query.student = student;
    }
    
    if (course) {
      query.course = course;
    }
    
    if (status) {
      query.status = status;
    }
    
    if (startDate && endDate) {
      query.enrollmentDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    // Student related filters
    if (department || level) {
      const studentQuery = {};
      
      if (department) {
        studentQuery.department = department;
      }
      
      if (level) {
        studentQuery.level = parseInt(level);
      }
      
      const students = await Student.find(studentQuery).select('_id');
      if (students.length === 0) {
        return res.status(200).json({
          success: true,
          count: 0,
          pagination: {
            total: 0,
            page: parseInt(page),
            pages: 0
          },
          data: []
        });
      }
      
      query.student = { $in: students.map(s => s._id) };
    }
    
    // Course related filters
    if (academicSession) {
      const courses = await Course.find({ academicSession }).select('_id');
      if (courses.length === 0) {
        return res.status(200).json({
          success: true,
          count: 0,
          pagination: {
            total: 0,
            page: parseInt(page),
            pages: 0
          },
          data: []
        });
      }
      
      query.course = { $in: courses.map(c => c._id) };
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Prepare sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Get enrollments with pagination
    const enrollments = await Enrollment.find(query)
      .populate({
        path: 'student',
        select: 'matricNumber',
        populate: [
          { path: 'user', select: 'fullName email' },
          { path: 'department', select: 'name code' }
        ]
      })
      .populate({
        path: 'course',
        select: 'code title credits',
        populate: [
          { path: 'department', select: 'name code' },
          { path: 'academicSession', select: 'name year semester' }
        ]
      })
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await Enrollment.countDocuments(query);
    
    res.status(200).json({
      success: true,
      count: enrollments.length,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      },
      data: enrollments
    });
  } catch (error) {
    console.error('Error getting enrollments:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting enrollments',
      error: error.message
    });
  }
};

/**
 * @desc    Force enroll a student in a course
 * @route   POST /api/admin/enrollments
 * @access  Private/Admin
 */
exports.forceEnrollStudent = async (req, res) => {
  try {
    const { studentId, courseId, status = 'accepted', notes } = req.body;
    
    // Validate required fields
    if (!studentId || !courseId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide studentId and courseId'
      });
    }
    
    // Check if student exists
    const student = await Student.findById(studentId)
      .populate('user', 'fullName email');
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }
    
    // Check if course exists
    const course = await Course.findById(courseId)
      .populate('department', 'name')
      .populate('academicSession', 'name year semester');
    
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Check if enrollment already exists
    const existingEnrollment = await Enrollment.findOne({
      student: studentId,
      course: courseId
    });
    
    if (existingEnrollment) {
      return res.status(400).json({
        success: false,
        message: 'Student is already enrolled in this course',
        data: existingEnrollment
      });
    }
    
    // Check if the course is for the student's department and level
    if (student.department && course.department && 
        student.department.toString() !== course.department.toString() && 
        !course.isElective) {
      // Warning only, not preventing enrollment
      console.warn(`Enrolling student in course from different department. Student: ${student.user?.fullName}, Course: ${course.code}`);
    }
    
    if (student.level !== course.level) {
      // Warning only, not preventing enrollment
      console.warn(`Enrolling student in course from different level. Student level: ${student.level}, Course level: ${course.level}`);
    }
    
    // Create enrollment
    const enrollment = await Enrollment.create({
      student: studentId,
      course: courseId,
      enrollmentDate: new Date(),
      status,
      notes: notes || `Force enrolled by admin (${req.user.fullName})`
    });
    
    // Populate the enrollment data for response
    await enrollment.populate([
      {
        path: 'student',
        select: 'matricNumber',
        populate: [
          { path: 'user', select: 'fullName email' },
          { path: 'department', select: 'name' }
        ]
      },
      {
        path: 'course',
        select: 'code title credits',
        populate: [
          { path: 'department', select: 'name' },
          { path: 'academicSession', select: 'name year semester' }
        ]
      }
    ]);
    
    // Log the activity - FIXED: Convert object to string and add required fields
    await SystemActivity.create({
      user: req.user._id,
      action: 'FORCE_ENROLLMENT', // Required field
      details: `Force enrolled student ${student.matricNumber} (${student.user?.fullName}) in course ${course.code} (${course.title})`, // String instead of object
      affectedModel: 'Enrollment', // Required field
      affectedId: enrollment._id // Required field
    });
    
    res.status(201).json({
      success: true,
      message: 'Student enrolled successfully',
      data: enrollment
    });
  } catch (error) {
    console.error('Error enrolling student:', error);
    res.status(500).json({
      success: false,
      message: 'Error enrolling student',
      error: error.message
    });
  }
};

/**
 * @desc    Batch enroll students in courses
 * @route   POST /api/admin/enrollments/batch
 * @access  Private/Admin
 */
exports.batchEnrollment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { enrollments, defaultStatus = 'pending' } = req.body;
    
    if (!enrollments || !Array.isArray(enrollments) || enrollments.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of enrollments'
      });
    }
    
    const results = {
      successful: [],
      failed: []
    };
    
    // Process each enrollment
    for (const enrollment of enrollments) {
      try {
        const { studentId, courseId, status = defaultStatus, notes } = enrollment;
        
        // Validate required fields
        if (!studentId || !courseId) {
          results.failed.push({
            enrollment,
            error: 'Missing studentId or courseId'
          });
          continue;
        }
        
        // Check if student exists
        const student = await Student.findById(studentId)
          .populate('user', 'fullName')
          .session(session);
        
        if (!student) {
          results.failed.push({
            enrollment,
            error: 'Student not found'
          });
          continue;
        }
        
        // Check if course exists
        const course = await Course.findById(courseId).session(session);
        if (!course) {
          results.failed.push({
            enrollment,
            error: 'Course not found'
          });
          continue;
        }
        
        // Check if enrollment already exists
        const existingEnrollment = await Enrollment.findOne({
          student: studentId,
          course: courseId
        }).session(session);
        
        if (existingEnrollment) {
          results.failed.push({
            enrollment,
            error: 'Student is already enrolled in this course',
            existingEnrollment
          });
          continue;
        }
        
        // Create enrollment
        const newEnrollment = await Enrollment.create([{
          student: studentId,
          course: courseId,
          enrollmentDate: new Date(),
          status,
          notes: notes || `Batch enrolled by admin (${req.user.fullName})`
        }], { session });
        
        results.successful.push({
          _id: newEnrollment[0]._id,
          student: {
            id: student._id,
            name: student.user?.fullName,
            matricNumber: student.matricNumber
          },
          course: {
            id: course._id,
            code: course.code,
            title: course.title
          },
          status
        });
      } catch (error) {
        results.failed.push({
          enrollment,
          error: error.message
        });
      }
    }
    
    await session.commitTransaction();
    session.endSession();
    
    // Log the activity - this should be after the transaction is complete
    try {
      await SystemActivity.create({
        user: req.user._id,
        activity: 'batch_enrollment',
        description: `Batch enrolled ${results.successful.length} students, failed ${results.failed.length}`,
        details: {
          successfulCount: results.successful.length,
          failedCount: results.failed.length
        }
      });
    } catch (logError) {
      console.error('Error logging activity:', logError);
      // Don't fail the request if just the logging fails
    }
    
    res.status(200).json({
      success: true,
      message: `Successfully enrolled ${results.successful.length} students, failed ${results.failed.length}`,
      data: results
    });
  } catch (error) {
    // Only abort if the transaction is still active
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    
    console.error('Error in batch enrollment:', error);
    res.status(500).json({
      success: false,
      message: 'Error in batch enrollment',
      error: error.message
    });
  }
};

/**
 * @desc    Import enrollments from CSV file
 * @route   POST /api/admin/enrollments/import
 * @access  Private/Admin
 */
exports.importEnrollmentsFromCSV = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a CSV file'
      });
    }
    
    const { defaultStatus = 'approved' } = req.body;
    
    // Parse CSV file
    const csvData = req.file.buffer.toString('utf8');
    
    // Simple CSV parser - assumes comma separated values and first row as headers
    const rows = csvData.split('\n');
    const headers = rows[0].split(',').map(header => header.trim());
    
    // Validate required headers
    const requiredHeaders = ['matricNumber', 'courseCode'];
    for (const header of requiredHeaders) {
      if (!headers.includes(header)) {
        return res.status(400).json({
          success: false,
          message: `CSV file must include ${requiredHeaders.join(', ')} columns`,
          details: {
            providedHeaders: headers,
            missingHeaders: requiredHeaders.filter(h => !headers.includes(h))
          }
        });
      }
    }
    
    const results = {
      successful: [],
      failed: []
    };
    
    // Process each row
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i].trim()) continue; // Skip empty rows
      
      const rowData = {};
      const values = rows[i].split(',').map(value => value.trim());
      
      // Create an object with header keys and row values
      headers.forEach((header, index) => {
        rowData[header] = values[index];
      });
      
      try {
        // Find student by matric number
        const student = await Student.findOne({ matricNumber: rowData.matricNumber })
          .populate('user', 'fullName')
          .session(session);
        
        if (!student) {
          results.failed.push({
            row: i + 1,
            data: rowData,
            error: `Student with matriculation number ${rowData.matricNumber} not found`
          });
          continue;
        }
        
        // Find course by code
        const course = await Course.findOne({ 
          code: { $regex: new RegExp(`^${rowData.courseCode}$`, 'i') }
        }).session(session);
        
        if (!course) {
          results.failed.push({
            row: i + 1,
            data: rowData,
            error: `Course with code ${rowData.courseCode} not found`
          });
          continue;
        }
        
        // Check if enrollment already exists
        const existingEnrollment = await Enrollment.findOne({
          student: student._id,
          course: course._id
        }).session(session);
        
        if (existingEnrollment) {
          results.failed.push({
            row: i + 1,
            data: rowData,
            error: `Student ${rowData.matricNumber} is already enrolled in course ${rowData.courseCode}`
          });
          continue;
        }
        
        // Determine status - can be specified in CSV or use default
        const status = rowData.status || defaultStatus;
        
        // Create enrollment
        const newEnrollment = await Enrollment.create([{
          student: student._id,
          course: course._id,
          enrollmentDate: new Date(),
          status,
          notes: rowData.notes || `Imported from CSV by admin (${req.user.fullName})`
        }], { session });
        
        results.successful.push({
          _id: newEnrollment[0]._id,
          row: i + 1,
          student: {
            id: student._id,
            name: student.user?.fullName,
            matricNumber: student.matricNumber
          },
          course: {
            id: course._id,
            code: course.code,
            title: course.title
          },
          status
        });
      } catch (error) {
        results.failed.push({
          row: i + 1,
          data: rowData,
          error: error.message
        });
      }
    }
    
    await session.commitTransaction();
    session.endSession();
    
    // Log the activity
    await SystemActivity.create({
      user: req.user._id,
      activity: 'import_enrollments',
      description: `Imported ${results.successful.length} enrollments from CSV, failed ${results.failed.length}`,
      details: {
        filename: req.file.originalname,
        successfulCount: results.successful.length,
        failedCount: results.failed.length
      }
    });
    
    res.status(200).json({
      success: true,
      message: `Successfully imported ${results.successful.length} enrollments, failed ${results.failed.length}`,
      data: results
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error importing enrollments from CSV:', error);
    res.status(500).json({
      success: false,
      message: 'Error importing enrollments from CSV',
      error: error.message
    });
  }
};

/**
 * @desc    Update enrollment status
 * @route   PATCH /api/admin/enrollments/:enrollmentId
 * @access  Private/Admin
 */
exports.updateEnrollmentStatus = async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    const { status, notes } = req.body;
    
    // Validate status
    const validStatuses = ['pending', 'accepted', 'rejected', 'canceled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${validStatuses.join(', ')}`
      });
    }
    
    // Find enrollment
    const enrollment = await Enrollment.findById(enrollmentId);
    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'Enrollment not found'
      });
    }
    
    // Update enrollment
    enrollment.status = status;
    if (notes) {
      enrollment.notes = enrollment.notes 
        ? `${enrollment.notes}\n${new Date().toISOString()}: ${notes}`
        : notes;
    }
    
    await enrollment.save();
    
    // Populate the enrollment data for response
    await enrollment.populate([
      {
        path: 'student',
        select: 'matricNumber',
        populate: [
          { path: 'user', select: 'fullName email' },
          { path: 'department', select: 'name' }
        ]
      },
      {
        path: 'course',
        select: 'code title credits',
        populate: [
          { path: 'department', select: 'name' },
          { path: 'academicSession', select: 'name year semester' }
        ]
      }
    ]);
    
    // Log the activity - FIXED SystemActivity creation
    await SystemActivity.create({
      user: req.user._id,
      action: 'UPDATE_ENROLLMENT_STATUS', // Required field
      details: `Updated enrollment status to ${status} for student in course ${enrollment.course.code}`, // Changed to string
      affectedModel: 'Enrollment', // Required field
      affectedId: enrollment._id // Required field
    });
    
    res.status(200).json({
      success: true,
      message: 'Enrollment status updated successfully',
      data: enrollment
    });
  } catch (error) {
    console.error('Error updating enrollment status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating enrollment status',
      error: error.message
    });
  }
};

/**
 * @desc    Delete an enrollment
 * @route   DELETE /api/admin/enrollments/:enrollmentId
 * @access  Private/Admin
 */
exports.deleteEnrollment = async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    
    // Find enrollment to delete (getting the data before deleting it)
    const enrollment = await Enrollment.findById(enrollmentId)
      .populate('student', 'matricNumber user')
      .populate({
        path: 'student',
        populate: {
          path: 'user',
          select: 'fullName'
        }
      })
      .populate('course', 'code title');
    
    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'Enrollment not found'
      });
    }
    
    // Delete enrollment
    await Enrollment.findByIdAndDelete(enrollmentId);
    
    // Log the activity with proper values for all required fields
    await SystemActivity.create({
      user: req.user._id,
      action: 'DELETE_ENROLLMENT',  // Required field
      details: `Admin deleted enrollment for student ${enrollment.student.matricNumber} in course ${enrollment.course.code}`, // Convert to string
      affectedModel: 'Enrollment',  // Required field
      affectedId: enrollment._id    // Required field
    });
    
    res.status(200).json({
      success: true,
      message: 'Enrollment deleted successfully',
      data: {
        _id: enrollmentId
      }
    });
  } catch (error) {
    console.error('Error deleting enrollment:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting enrollment',
      error: error.message
    });
  }
};

/**
 * @desc    Set course as compulsory/optional
 * @route   PATCH /api/admin/courses/:courseId/compulsory
 * @access  Private/Admin
 */
exports.setCourseCompulsory = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { isCompulsory, department } = req.body;
    
    if (typeof isCompulsory !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Please provide isCompulsory as a boolean value'
      });
    }
    
    const course = await Course.findById(courseId);
    
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // If department is provided as a string name, find the ID
    let departmentId = course.department;
    if (department && typeof department === 'string' && !mongoose.Types.ObjectId.isValid(department)) {
      const departmentDoc = await Department.findOne({
        name: { $regex: new RegExp(`^${department}$`, 'i') }
      });

      if (!departmentDoc) {
        return res.status(404).json({
          success: false,
          message: `Department "${department}" not found. Please check the department name.`
        });
      }

      departmentId = departmentDoc._id;
      course.department = departmentId;
    }
    
    // Ensure academicSession is set if missing
    if (!course.academicSession) {
      // Find active academic session
      const activeSession = await AcademicSession.findOne({ isActive: true });
      if (!activeSession) {
        return res.status(400).json({
          success: false,
          message: 'No active academic session found. Please create one before updating courses.'
        });
      }
      course.academicSession = activeSession._id;
    }
    
    // Set the compulsory flag
    course.isCompulsory = isCompulsory;
    await course.save();
    
    // If course is marked as compulsory, auto-assign to matching students
    if (isCompulsory) {
      // Find matching students
      const students = await Student.find({
        department: departmentId,
        level: course.level
      });
      
      // Auto-assign course to each student
      for (const student of students) {
        // Check if student already has this course
        if (!student.courses.includes(courseId) && 
            !student.courses.some(c => c.toString() === courseId.toString())) {
          student.courses.push(courseId);
          await student.save();
        }
      }
      
      console.log(`Auto-assigned course ${courseId} to ${students.length} students`);
    }
    
    res.status(200).json({
      success: true,
      data: course,
      message: `Course marked as ${isCompulsory ? 'compulsory' : 'optional'}`
    });
  } catch (error) {
    console.error('Error setting course compulsory status:', error);
    res.status(500).json({
      success: false,
      message: 'Error setting course compulsory status',
      error: error.message
    });
  }
};
/**
 * @desc    Assign compulsory courses to matching students
 * @route   POST /api/admin/courses/assign-compulsory
 * @access  Private/Admin
 */

exports.assignCompulsoryCourses = async (req, res) => {
  try {
    // Find active academic session
    const activeSession = await AcademicSession.findOne({ isActive: true });
    
    if (!activeSession) {
      return res.status(404).json({
        success: false,
        message: 'No active academic session found'
      });
    }
    
    // Find all compulsory courses
    const compulsoryCourses = await Course.find({
      isCompulsory: true,
      isActive: true,
      academicSession: activeSession._id
    });
    
    if (compulsoryCourses.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No compulsory courses found'
      });
    }
    
    // Group courses by department and level
    const coursesByDeptLevel = {};
    
    compulsoryCourses.forEach(course => {
      const key = `${course.department}-${course.level}`;
      if (!coursesByDeptLevel[key]) {
        coursesByDeptLevel[key] = [];
      }
      coursesByDeptLevel[key].push(course._id);
    });
    
    // Process each department-level group
    const results = [];
    
    for (const [deptLevel, courseIds] of Object.entries(coursesByDeptLevel)) {
      const [department, level] = deptLevel.split('-');
      
      // Find students in this department and level
      const students = await Student.find({ department, level });
      
      // Auto-assign courses to each student
      let assignedCount = 0;
      
      for (const student of students) {
        let studentAssigned = false;
        
        // Add missing courses
        for (const courseId of courseIds) {
          if (!student.courses.includes(courseId) && 
              !student.courses.some(c => c.toString() === courseId.toString())) {
            student.courses.push(courseId);
            studentAssigned = true;
          }
        }
        
        // Save only if changes were made
        if (studentAssigned) {
          await student.save();
          assignedCount++;
        }
      }
      
      // Get department name for better reporting
      let departmentName = department;
      try {
        const departmentDoc = await Department.findById(department);
        if (departmentDoc) {
          departmentName = departmentDoc.name;
        }
      } catch (err) {
        console.warn(`Could not get department name for ${department}`);
      }
      
      results.push({
        departmentId: department,
        departmentName,
        level,
        totalStudents: students.length,
        studentsAssigned: assignedCount,
        coursesAssigned: courseIds.length
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Compulsory courses assigned successfully',
      data: results
    });
  } catch (error) {
    console.error('Error assigning compulsory courses:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning compulsory courses',
      error: error.message
    });
  }
};
// @desc    Assign compulsory courses to matching students
// @route   POST /api/admin/courses/assign-compulsory
// @access  Private/Admin
exports.assignCompulsoryCourses = async (req, res) => {
  try {
    // Find active academic session
    const activeSession = await AcademicSession.findOne({ isActive: true });
    
    if (!activeSession) {
      return res.status(404).json({
        success: false,
        message: 'No active academic session found'
      });
    }
    
    // Find all compulsory courses
    const compulsoryCourses = await Course.find({
      isCompulsory: true,
      isActive: true,
      academicSession: activeSession._id
    });
    
    if (compulsoryCourses.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No compulsory courses found'
      });
    }
    
    // Group courses by department and level
    const coursesByDeptLevel = {};
    
    compulsoryCourses.forEach(course => {
      const key = `${course.department}-${course.level}`;
      if (!coursesByDeptLevel[key]) {
        coursesByDeptLevel[key] = [];
      }
      coursesByDeptLevel[key].push(course._id);
    });
    
    // Process each department-level group
    const results = [];
    
    for (const [deptLevel, courseIds] of Object.entries(coursesByDeptLevel)) {
      const [department, level] = deptLevel.split('-');
      
      // Find students in this department and level
      const students = await Student.find({ department, level });
      
      // Auto-assign courses to each student
      let assignedCount = 0;
      
      for (const student of students) {
        let studentAssigned = false;
        
        // Add missing courses
        for (const courseId of courseIds) {
          if (!student.courses.includes(courseId) && 
              !student.courses.some(c => c.toString() === courseId.toString())) {
            student.courses.push(courseId);
            studentAssigned = true;
          }
        }
        
        // Save only if changes were made
        if (studentAssigned) {
          await student.save();
          assignedCount++;
        }
      }
      
      results.push({
        department,
        level,
        totalStudents: students.length,
        studentsAssigned: assignedCount,
        coursesAssigned: courseIds.length
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Compulsory courses assigned successfully',
      data: results
    });
  } catch (error) {
    console.error('Error assigning compulsory courses:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning compulsory courses',
      error: error.message
    });
  }
};
// @desc    Create a new course
// @route   POST /api/admin/courses
// @access  Private/Admin
exports.createCourse = async (req, res) => {
  try {
    const { 
      title, 
      code, 
      description, 
      department, 
      level, 
      credits, 
      semester,
      academicSessionId,
      isCompulsory = false,
      lecturerId 
    } = req.body;

    // Validate required fields
    if (!title || !code || !department || !level) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }

    // Check if course code already exists
    const existingCourse = await Course.findOne({ code });
    if (existingCourse) {
      return res.status(400).json({
        success: false,
        message: 'Course with this code already exists'
      });
    }

    // Find department by ID or name
    let departmentId = department;

    // If department is a string but not a valid ObjectId, try to find by name
    if (typeof department === 'string' && !mongoose.Types.ObjectId.isValid(department)) {
      const departmentDoc = await Department.findOne({
        name: { $regex: new RegExp(`^${department}$`, 'i') }
      });

      if (!departmentDoc) {
        return res.status(404).json({
          success: false,
          message: `Department "${department}" not found. Please check the department name.`
        });
      }

      departmentId = departmentDoc._id;
    }

    // Find active academic session if none provided
    let academicSession = academicSessionId;
    if (!academicSession) {
      const activeSession = await AcademicSession.findOne({ isActive: true });
      if (!activeSession) {
        return res.status(400).json({
          success: false,
          message: 'No active academic session found. Please create one before adding courses.'
        });
      }
      academicSession = activeSession._id;
    }

    // Normalize semester value
    let normalizedSemester = semester;
    if (semester) {
      const semValue = semester.toString().toLowerCase();
      if (semValue === '1' || semValue === 'first') {
        normalizedSemester = 'First';
      } else if (semValue === '2' || semValue === 'second') {
        normalizedSemester = 'Second';
      }
    }

    // Create course
    const course = await Course.create({
      title,
      code,
      description,
      department: departmentId,
      level,
      credits,
      semester: normalizedSemester,
      academicSession,
      lecturer: lecturerId,
      isCompulsory
    });

    // If course is compulsory, auto-assign to matching students
    if (isCompulsory) {
      const students = await Student.find({ department: departmentId, level });
      
      for (const student of students) {
        student.courses.push(course._id);
        await student.save();
      }
      
      console.log(`Auto-assigned course ${course._id} to ${students.length} students`);
    }

    res.status(201).json({
      success: true,
      data: course
    });
  } catch (error) {
    console.error('Error creating course:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating course',
      error: error.message
    });
  }
};