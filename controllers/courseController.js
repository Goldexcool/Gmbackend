const Course = require('../models/Course');
const User = require('../models/User');
const Student = require('../models/Student');
const Lecturer = require('../models/Lecturer');
const mongoose = require('mongoose');

// @desc    Create new course
// @route   POST /api/courses
// @access  Private (Lecturers only)
exports.createCourse = async (req, res) => {
  try {
    const { 
      title, 
      code, 
      description, 
      credits, 
      department, 
      schedule, 
      capacity, 
      prerequisites,
      syllabus 
    } = req.body;
    
    // Validate required fields
    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title and description'
      });
    }
    
    // Verify lecturer role
    if (req.user.role !== 'lecturer' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only lecturers and admins can create courses'
      });
    }
    
    // Create course
    const course = await Course.create({
      title,
      code,
      description,
      credits,
      department,
      schedule,
      capacity,
      prerequisites,
      syllabus,
      assignedLecturers: [req.user.id], // Assign creator as lecturer
      createdBy: req.user.id
    });
    
    // Add course to lecturer's courses
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    if (lecturer) {
      lecturer.courses.push(course._id);
      await lecturer.save();
    }
    
    res.status(201).json({
      success: true,
      message: 'Course created successfully',
      course
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

// @desc    Get all courses
// @route   GET /api/courses
// @access  Private
exports.getAllCourses = async (req, res) => {
  try {
    const { department, lecturer, search } = req.query;
    let query = {};
    
    // Build query filters
    if (department) {
      query.department = department;
    }
    
    if (lecturer) {
      query.assignedLecturers = lecturer;
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Get courses with pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    
    const courses = await Course.find(query)
      .populate('assignedLecturers', 'fullName')
      .skip(startIndex)
      .limit(limit)
      .sort({ title: 1 });
    
    const total = await Course.countDocuments(query);
    
    res.status(200).json({
      success: true,
      count: courses.length,
      total,
      pagination: {
        current: page,
        totalPages: Math.ceil(total / limit),
        limit
      },
      courses
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

// @desc    Get single course
// @route   GET /api/courses/:id
// @access  Private
exports.getCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('assignedLecturers', 'fullName')
      .populate('prerequisites', 'title code')
      .populate({
        path: 'enrolledStudents',
        select: 'fullName email',
      });
    
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    res.status(200).json({
      success: true,
      course
    });
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Update course
// @route   PUT /api/courses/:id
// @access  Private (Lecturer/Admin only)
exports.updateCourse = async (req, res) => {
  try {
    let course = await Course.findById(req.params.id);
    
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Check if user is a lecturer assigned to this course or admin
    const isAuthorized = 
      req.user.role === 'admin' || 
      course.assignedLecturers.includes(req.user.id);
    
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this course'
      });
    }
    
    // Update course
    course = await Course.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true, runValidators: true }
    );
    
    res.status(200).json({
      success: true,
      message: 'Course updated successfully',
      course
    });
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Delete course
// @route   DELETE /api/courses/:id
// @access  Private (Admin only)
exports.deleteCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Only admin can delete courses
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can delete courses'
      });
    }
    
    await course.deleteOne();
    
    // Remove course from lecturers
    await Lecturer.updateMany(
      { courses: req.params.id },
      { $pull: { courses: req.params.id } }
    );
    
    res.status(200).json({
      success: true,
      message: 'Course deleted successfully',
      data: {}
    });
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Enroll student in course
// @route   POST /api/courses/enroll/:id
// @access  Private (Students only)
exports.enrollCourse = async (req, res) => {
  try {
    // Verify student role
    if (req.user.role !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'Only students can enroll in courses'
      });
    }
    
    const course = await Course.findById(req.params.id);
    
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Check if student is already enrolled
    if (course.enrolledStudents.includes(req.user.id)) {
      return res.status(400).json({
        success: false,
        message: 'You are already enrolled in this course'
      });
    }
    
    // Check if course is at capacity
    if (course.capacity && course.enrolledStudents.length >= course.capacity) {
      return res.status(400).json({
        success: false,
        message: 'This course has reached its capacity'
      });
    }
    
    // Add student to course
    course.enrolledStudents.push(req.user.id);
    await course.save();
    
    // Add course to student
    const student = await Student.findOne({ user: req.user.id });
    if (student) {
      student.courses.push(course._id);
      await student.save();
    }
    
    // Notify lecturer if requested
    if (req.body.notifyInstructor && course.assignedLecturers.length > 0) {
      // In a real app, you'd send notification to lecturer here
      console.log(`Notifying lecturer about new enrollment: ${req.user.id} in ${course.title}`);
    }
    
    res.status(200).json({
      success: true,
      message: 'Successfully enrolled in the course',
      course: {
        id: course._id,
        title: course.title,
        code: course.code
      }
    });
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Unenroll student from course
// @route   DELETE /api/courses/unenroll/:id
// @access  Private (Students only)
exports.unenrollCourse = async (req, res) => {
  try {
    // Verify student role
    if (req.user.role !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'Only students can unenroll from courses'
      });
    }
    
    const course = await Course.findById(req.params.id);
    
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Check if student is enrolled
    if (!course.enrolledStudents.includes(req.user.id)) {
      return res.status(400).json({
        success: false,
        message: 'You are not enrolled in this course'
      });
    }
    
    // Remove student from course
    course.enrolledStudents = course.enrolledStudents.filter(
      student => student.toString() !== req.user.id
    );
    await course.save();
    
    // Remove course from student
    await Student.updateOne(
      { user: req.user.id },
      { $pull: { courses: course._id } }
    );
    
    res.status(200).json({
      success: true,
      message: 'Successfully unenrolled from the course',
      data: {}
    });
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get enrolled students for a course
// @route   GET /api/courses/:id/students
// @access  Private (Lecturers only)
exports.getCourseStudents = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Verify lecturer is assigned to this course or admin
    const isAuthorized = 
      req.user.role === 'admin' || 
      (req.user.role === 'lecturer' && course.assignedLecturers.includes(req.user.id));
    
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this information'
      });
    }
    
    // Get student details
    const students = await User.find({
      _id: { $in: course.enrolledStudents },
      role: 'student'
    }).select('fullName email avatar');
    
    res.status(200).json({
      success: true,
      count: students.length,
      students
    });
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get courses user is enrolled in
// @route   GET /api/courses/enrolled
// @access  Private (Students only)
exports.getEnrolledCourses = async (req, res) => {
  try {
    // Verify student role
    if (req.user.role !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'This endpoint is for students only'
      });
    }
    
    const student = await Student.findOne({ user: req.user.id });
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student record not found'
      });
    }
    
    const courses = await Course.find({
      _id: { $in: student.courses }
    }).select('title code description department schedule');
    
    res.status(200).json({
      success: true,
      count: courses.length,
      courses
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

// @desc    Get courses user is teaching
// @route   GET /api/courses/teaching
// @access  Private (Lecturers only)
exports.getTeachingCourses = async (req, res) => {
  try {
    // Verify lecturer role
    if (req.user.role !== 'lecturer') {
      return res.status(403).json({
        success: false,
        message: 'This endpoint is for lecturers only'
      });
    }
    
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer record not found'
      });
    }
    
    const courses = await Course.find({
      _id: { $in: lecturer.courses }
    }).select('title code description department schedule enrolledStudents');
    
    res.status(200).json({
      success: true,
      count: courses.length,
      courses
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

// @desc    Add course material
// @route   POST /api/courses/:id/materials
// @access  Private (Lecturers only)
exports.addCourseMaterial = async (req, res) => {
  try {
    const { title, type, url } = req.body;
    
    // Validate required fields
    if (!title || !type || !url) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title, type, and URL for the material'
      });
    }
    
    const course = await Course.findById(req.params.id);
    
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Verify lecturer is assigned to this course or admin
    const isAuthorized = 
      req.user.role === 'admin' || 
      (req.user.role === 'lecturer' && course.assignedLecturers.includes(req.user.id));
    
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to add materials to this course'
      });
    }
    
    // Add material to course
    const material = {
      title,
      type,
      url,
      uploadedBy: req.user.id,
      uploadedAt: Date.now()
    };
    
    course.materials = course.materials || [];
    course.materials.push(material);
    
    await course.save();
    
    res.status(201).json({
      success: true,
      message: 'Course material added successfully',
      material
    });
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};