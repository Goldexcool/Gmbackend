const mongoose = require('mongoose');
const Course = require('../models/Course');
const Department = require('../models/Department');
const Student = require('../models/Student');
const AcademicSession = require('../models/AcademicSession');
const Enrollment = require('../models/Enrollment');
const Lecturer = require('../models/Lecturer');

/**
 * Helper function to resolve department ID from name or ID
 * @param {string} department - Department name or ID
 * @returns {Promise<string|null>} - Department ID or null if not found
 */
const resolveDepartmentId = async (department) => {
  // If department is missing, return null
  if (!department) return null;
  
  // If it's already a valid ObjectId, return as is
  if (mongoose.Types.ObjectId.isValid(department)) {
    return department;
  }
  
  // Otherwise, search by name (case-insensitive)
  const departmentDoc = await Department.findOne({
    name: { $regex: new RegExp(`^${department}$`, 'i') }
  });
  
  return departmentDoc ? departmentDoc._id : null;
};

/**
 * @desc    Get courses the authenticated user is enrolled in
 * @route   GET /api/courses/enrolled
 * @access  Private
 */
exports.getEnrolledCourses = async (req, res) => {
  try {
    // Get the authenticated user
    const userId = req.user.id;
    
    // Find the student profile for this user
    const student = await Student.findOne({ user: userId });
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }
    
    // Find the enrollments for this student separately
    const enrollments = await Enrollment.find({ 
      student: student._id,
      status: 'accepted' // Only include accepted enrollments
    }).select('course status enrollmentDate grade');
    
    if (enrollments.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: []
      });
    }
    
    // Extract course IDs and enrollment info
    const courseIds = [];
    const enrollmentInfo = {};
    
    enrollments.forEach(enrollment => {
      const courseId = enrollment.course.toString();
      courseIds.push(enrollment.course);
      enrollmentInfo[courseId] = {
        status: enrollment.status,
        enrollmentDate: enrollment.enrollmentDate,
        grade: enrollment.grade
      };
    });
    
    // Fetch the actual course details
    const courses = await Course.find({ _id: { $in: courseIds } })
      .populate('department', 'name code')
      .populate('lecturer', 'user')
      .populate({
        path: 'lecturer',
        populate: {
          path: 'user',
          select: 'fullName email profilePicture'
        }
      })
      .populate('academicSession', 'name year semester isActive');
    
    const coursesWithEnrollmentInfo = courses.map(course => {
      const info = enrollmentInfo[course._id.toString()];
      return {
        ...course.toObject(),
        enrollmentStatus: info.status,
        enrollmentDate: info.enrollmentDate,
        grade: info.grade
      };
    });
    
    // Sort courses by department and code
    coursesWithEnrollmentInfo.sort((a, b) => {
      if (a.department?.code === b.department?.code) {
        return a.code.localeCompare(b.code);
      }
      return a.department?.code?.localeCompare(b.department?.code) || 0;
    });
    
    res.status(200).json({
      success: true,
      count: coursesWithEnrollmentInfo.length,
      data: coursesWithEnrollmentInfo
    });
  } catch (error) {
    console.error('Error getting enrolled courses:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting enrolled courses',
      error: error.message
    });
  }
};

/**
 * @desc    Get courses available for enrollment
 * @route   GET /api/courses/available
 * @access  Private
 */
exports.getAvailableCourses = async (req, res) => {
  try {
    // Get the authenticated user
    const userId = req.user.id;
    
    // Find the student profile for this user
    const student = await Student.findOne({ user: userId });
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }
    
    // Get current active academic session
    const activeSession = await AcademicSession.findOne({ isActive: true });
    
    if (!activeSession) {
      return res.status(404).json({
        success: false,
        message: 'No active academic session found'
      });
    }
    
    // Get courses the student is already enrolled in
    const enrollments = await Enrollment.find({ 
      student: student._id,
      status: { $nin: ['rejected', 'canceled'] } // Exclude rejected and canceled enrollments
    });
    
    const enrolledCourseIds = enrollments.map(enrollment => enrollment.course.toString());
    
    // Find courses that:
    // 1. Are in the active academic session
    // 2. Match student's department or are electives
    // 3. Match student's level
    // 4. Student is not already enrolled in
    const query = {
      academicSession: activeSession._id,
      _id: { $nin: enrolledCourseIds }, // Exclude already enrolled courses
      $or: [
        { department: student.department }, // Courses from student's department
        { isElective: true } // Elective courses
      ],
      level: student.level // Match student's level
    };
    
    // Fetch available courses
    const courses = await Course.find(query)
      .populate('department', 'name code')
      .populate('lecturer', 'user')
      .populate({
        path: 'lecturer',
        populate: {
          path: 'user',
          select: 'fullName email profilePicture'
        }
      })
      .populate('academicSession', 'name year semester');
    
    // Sort courses by department and code
    courses.sort((a, b) => {
      if (a.department?.code === b.department?.code) {
        return a.code.localeCompare(b.code);
      }
      return a.department?.code?.localeCompare(b.department?.code) || 0;
    });
    
    res.status(200).json({
      success: true,
      count: courses.length,
      data: courses
    });
  } catch (error) {
    console.error('Error getting available courses:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting available courses',
      error: error.message
    });
  }
};

/**
 * @desc    Get all courses
 * @route   GET /api/courses
 * @access  Private
 */
exports.getAllCourses = async (req, res) => {
  try {
    const { 
      department, 
      level, 
      semester, 
      academicSession,
      search,
      page = 1,
      limit = 20,
      sortBy = 'code',
      sortOrder = 'asc'
    } = req.query;
    
    // Build query object
    const query = {};
    
    // Handle department - accept both ID and name
    if (department) {
      const departmentId = await resolveDepartmentId(department);
      if (departmentId) {
        query.department = departmentId;
      } else if (typeof department === 'string') {
        // If department name wasn't found but was provided, return empty result
        // This prevents showing all courses when a specific department was requested
        console.log(`Department not found: ${department}`);
        return res.status(200).json({
          success: true,
          count: 0,
          total: 0,
          pages: 0,
          currentPage: parseInt(page),
          data: [],
          message: `No courses found for department: ${department}`
        });
      }
    }
    
    // Add other filters
    if (level) query.level = level;
    if (semester) query.semester = semester;
    if (academicSession) query.academicSession = academicSession;
    
    // Add search functionality
    if (search) {
      query.$or = [
        { code: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Execute query with pagination
    const courses = await Course.find(query)
      .populate('department', 'name code')
      .populate('lecturer', 'user')
      .populate('lecturer.user', 'name')
      .populate('academicSession', 'name year')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await Course.countDocuments(query);
    
    res.status(200).json({
      success: true,
      count: courses.length,
      total,
      pages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
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
 * @desc    Get a single course by ID
 * @route   GET /api/courses/:id
 * @access  Private
 */
exports.getCourseById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const course = await Course.findById(id)
      .populate('department', 'name code')
      .populate('lecturer', 'user staffId')
      .populate('lecturer.user', 'name email')
      .populate('academicSession', 'name year isActive');
    
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Get enrollment count
    const enrollmentCount = await Student.countDocuments({
      courses: course._id
    });
    
    // Add enrollment count to response
    const courseWithStats = {
      ...course.toObject(),
      enrollmentCount
    };
    
    res.status(200).json({
      success: true,
      data: courseWithStats
    });
  } catch (error) {
    console.error('Error getting course:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting course',
      error: error.message
    });
  }
};

/**
 * @desc    Create a new course
 * @route   POST /api/courses
 * @access  Private/Admin
 */
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
    const departmentId = await resolveDepartmentId(department);
    
    if (!departmentId) {
      return res.status(404).json({
        success: false,
        message: `Department "${department}" not found. Please check the department name or ID.`
      });
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
      department: departmentId, // Use the resolved department ID
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
 * @desc    Update a course
 * @route   PUT /api/courses/:id
 * @access  Private/Admin
 */
exports.updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      code,
      title,
      description,
      department,
      level,
      semester,
      credits,
      lecturer,
      academicSession,
      prerequisites,
      isElective
    } = req.body;
    
    // Check if course exists
    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // If code is changing, check for duplicates
    if (code && code !== course.code) {
      const existingCourse = await Course.findOne({ code });
      if (existingCourse) {
        return res.status(400).json({
          success: false,
          message: `Course with code ${code} already exists`
        });
      }
    }
    
    // Handle department - resolve ID if name provided
    let departmentId = course.department;
    if (department) {
      departmentId = await resolveDepartmentId(department);
      if (!departmentId) {
        return res.status(404).json({
          success: false,
          message: `Department "${department}" not found. Please check the department name or ID.`
        });
      }
    }
    
    // Handle lecturer change
    const oldLecturer = course.lecturer;
    
    // Update the course
    const updatedCourse = await Course.findByIdAndUpdate(
      id,
      {
        code: code || course.code,
        title: title || course.title,
        description: description || course.description,
        department: departmentId,
        level: level || course.level,
        semester: semester || course.semester,
        credits: credits || course.credits,
        lecturer: lecturer || course.lecturer,
        academicSession: academicSession || course.academicSession,
        prerequisites: prerequisites || course.prerequisites,
        isElective: isElective !== undefined ? isElective : course.isElective
      },
      { new: true }
    )
    .populate('department', 'name code')
    .populate('lecturer', 'user')
    .populate('lecturer.user', 'name')
    .populate('academicSession', 'name year');
    
    // Update lecturer references if changed
    if (lecturer && oldLecturer && lecturer.toString() !== oldLecturer.toString()) {
      // Remove course from old lecturer's list
      await Lecturer.findByIdAndUpdate(
        oldLecturer,
        { $pull: { courses: course._id } }
      );
      
      // Add course to new lecturer's list
      await Lecturer.findByIdAndUpdate(
        lecturer,
        { $addToSet: { courses: course._id } }
      );
    } else if (lecturer && !oldLecturer) {
      // Add course to new lecturer's list
      await Lecturer.findByIdAndUpdate(
        lecturer,
        { $addToSet: { courses: course._id } }
      );
    }
    
    res.status(200).json({
      success: true,
      message: 'Course updated successfully',
      data: updatedCourse
    });
  } catch (error) {
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
 * @route   DELETE /api/courses/:id
 * @access  Private/Admin
 */
exports.deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if course exists
    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Remove course from lecturer's list
    if (course.lecturer) {
      await Lecturer.findByIdAndUpdate(
        course.lecturer,
        { $pull: { courses: course._id } }
      );
    }
    
    // Remove course from all students' lists
    await Student.updateMany(
      { courses: course._id },
      { $pull: { courses: course._id } }
    );
    
    // Delete the course
    await Course.findByIdAndDelete(id);
    
    res.status(200).json({
      success: true,
      message: 'Course deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting course:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting course',
      error: error.message
    });
  }
};

/**
 * @desc    Get public course listing
 * @route   GET /api/courses/public
 * @access  Public
 */
exports.getPublicCourses = async (req, res) => {
  try {
    const courses = await Course.find()
      .select('code title department level credits')
      .populate('department', 'name')
      .sort({ code: 1 })
      .limit(100);
    
    res.status(200).json({
      success: true,
      count: courses.length,
      data: courses
    });
  } catch (error) {
    console.error('Error getting public courses:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting public courses',
      error: error.message
    });
  }
};

/**
 * @desc    Get course resources
 * @route   GET /api/courses/:id/resources
 * @access  Private
 */
exports.getCourseResources = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find course
    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Get current active academic session
    const activeSession = await AcademicSession.findOne({ isActive: true });
    
    // Find resources for this course
    const CourseResource = require('../models/CourseResource');
    const query = { course: id };
    
    // If user is a student, only show resources visible to students
    if (req.user.role === 'student') {
      query.visibleToStudents = true;
      
      // Also check if student is enrolled in this course
      const student = await Student.findOne({ user: req.user.id });
      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student profile not found'
        });
      }
      
      const isEnrolled = student.courses.some(
        courseId => courseId.toString() === id
      );
      
      if (!isEnrolled) {
        return res.status(403).json({
          success: false,
          message: 'You are not enrolled in this course'
        });
      }
    }
    
    // If active session exists, default to showing resources from that session
    const { academicSession = activeSession?._id } = req.query;
    if (academicSession) {
      query.academicSession = academicSession;
    }
    
    const resources = await CourseResource.find(query)
      .populate('lecturer', 'user')
      .populate('lecturer.user', 'name')
      .populate('academicSession', 'name year')
      .sort('-createdAt');
    
    res.status(200).json({
      success: true,
      count: resources.length,
      data: resources
    });
  } catch (error) {
    console.error('Error getting course resources:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting course resources',
      error: error.message
    });
  }
};

/**
 * @desc    Get courses by department
 * @route   GET /api/courses/by-department/:departmentId
 * @access  Private/Admin
 */
exports.getCoursesByDepartment = async (req, res) => {
  try {
    const { departmentId } = req.params;
    
    // Handle both department ID and name
    const resolvedDepartmentId = await resolveDepartmentId(departmentId);
    
    if (!resolvedDepartmentId) {
      return res.status(404).json({
        success: false,
        message: `Department "${departmentId}" not found. Please check the department name or ID.`
      });
    }
    
    const courses = await Course.find({ department: resolvedDepartmentId })
      .populate('department', 'name code')
      .populate('lecturer', 'user')
      .populate('lecturer.user', 'name')
      .populate('academicSession', 'name year')
      .sort('code');
    
    res.status(200).json({
      success: true,
      count: courses.length,
      data: courses
    });
  } catch (error) {
    console.error('Error getting department courses:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting department courses',
      error: error.message
    });
  }
};

/**
 * @desc    Get courses by faculty
 * @route   GET /api/courses/by-faculty/:facultyId
 * @access  Private/Admin
 */
exports.getCoursesByFaculty = async (req, res) => {
  try {
    const { facultyId } = req.params;
    
    // Find departments in this faculty
    const departments = await Department.find({ faculty: facultyId });
    const departmentIds = departments.map(dept => dept._id);
    
    // Find courses in these departments
    const courses = await Course.find({ department: { $in: departmentIds } })
      .populate('department', 'name code')
      .populate('lecturer', 'user')
      .populate('lecturer.user', 'name')
      .populate('academicSession', 'name year')
      .sort('department code');
    
    res.status(200).json({
      success: true,
      count: courses.length,
      data: courses
    });
  } catch (error) {
    console.error('Error getting faculty courses:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting faculty courses',
      error: error.message
    });
  }
};

/**
 * @desc    Get courses by academic session
 * @route   GET /api/courses/by-session/:sessionId
 * @access  Private/Admin
 */
exports.getCoursesBySession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const courses = await Course.find({ academicSession: sessionId })
      .populate('department', 'name code')
      .populate('lecturer', 'user')
      .populate('lecturer.user', 'name')
      .sort('code');
    
    res.status(200).json({
      success: true,
      count: courses.length,
      data: courses
    });
  } catch (error) {
    console.error('Error getting session courses:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting session courses',
      error: error.message
    });
  }
};

/**
 * @desc    Enroll students in a course
 * @route   POST /api/courses/:id/enroll
 * @access  Private/Admin
 */
exports.enrollStudents = async (req, res) => {
  try {
    const { id } = req.params;
    const { studentIds } = req.body;
    
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of student IDs'
      });
    }
    
    // Check if course exists
    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Update each student's courses
    const updatePromises = studentIds.map(studentId =>
      Student.findByIdAndUpdate(
        studentId,
        { $addToSet: { courses: id } }
      )
    );
    
    await Promise.all(updatePromises);
    
    res.status(200).json({
      success: true,
      message: `${studentIds.length} student(s) enrolled in course successfully`,
      data: {
        courseId: id,
        courseCode: course.code,
        courseTitle: course.title,
        enrolledStudents: studentIds.length
      }
    });
  } catch (error) {
    console.error('Error enrolling students:', error);
    res.status(500).json({
      success: false,
      message: 'Error enrolling students',
      error: error.message
    });
  }
};

/**
 * @desc    Remove students from a course
 * @route   DELETE /api/courses/:id/enroll
 * @access  Private/Admin
 */
exports.removeStudentsFromCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const { studentIds } = req.body;
    
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of student IDs'
      });
    }
    
    // Check if course exists
    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Update each student's courses
    const updatePromises = studentIds.map(studentId =>
      Student.findByIdAndUpdate(
        studentId,
        { $pull: { courses: id } }
      )
    );
    
    await Promise.all(updatePromises);
    
    res.status(200).json({
      success: true,
      message: `${studentIds.length} student(s) removed from course successfully`,
      data: {
        courseId: id,
        courseCode: course.code,
        courseTitle: course.title,
        removedStudents: studentIds.length
      }
    });
  } catch (error) {
    console.error('Error removing students:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing students',
      error: error.message
    });
  }
};

/**
 * @desc    Assign lecturer to a course
 * @route   POST /api/courses/:id/assign-lecturer
 * @access  Private/Admin
 */
exports.assignLecturer = async (req, res) => {
  try {
    const { id } = req.params;
    const { lecturerId } = req.body;
    
    if (!lecturerId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a lecturer ID'
      });
    }
    
    // Check if course exists
    const course = await Course.findById(id);
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
    
    // Update course with new lecturer
    const oldLecturerId = course.lecturer;
    course.lecturer = lecturerId;
    await course.save();
    
    // Add course to new lecturer's courses
    await Lecturer.findByIdAndUpdate(
      lecturerId,
      { $addToSet: { courses: id } }
    );
    
    // Remove course from old lecturer's courses if applicable
    if (oldLecturerId) {
      await Lecturer.findByIdAndUpdate(
        oldLecturerId,
        { $pull: { courses: id } }
      );
    }
    
    res.status(200).json({
      success: true,
      message: 'Lecturer assigned to course successfully',
      data: {
        courseId: id,
        courseCode: course.code,
        courseTitle: course.title,
        lecturerId,
        lecturerName: lecturer.user ? lecturer.user.name : undefined
      }
    });
  } catch (error) {
    console.error('Error assigning lecturer:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning lecturer',
      error: error.message
    });
  }
};

/**
 * @desc    Remove lecturer from a course
 * @route   DELETE /api/courses/:id/lecturer
 * @access  Private/Admin
 */
exports.removeLecturer = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if course exists
    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Check if course has a lecturer assigned
    if (!course.lecturer) {
      return res.status(400).json({
        success: false,
        message: 'Course does not have a lecturer assigned'
      });
    }
    
    const oldLecturerId = course.lecturer;
    
    // Remove lecturer from course
    course.lecturer = null;
    await course.save();
    
    // Remove course from lecturer's courses
    await Lecturer.findByIdAndUpdate(
      oldLecturerId,
      { $pull: { courses: id } }
    );
    
    res.status(200).json({
      success: true,
      message: 'Lecturer removed from course successfully',
      data: {
        courseId: id,
        courseCode: course.code,
        courseTitle: course.title
      }
    });
  } catch (error) {
    console.error('Error removing lecturer:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing lecturer',
      error: error.message
    });
  }
};

/**
 * @desc    Bulk create multiple courses
 * @route   POST /api/courses/bulk-create
 * @access  Private/Admin
 */
exports.bulkCreateCourses = async (req, res) => {
  try {
    const { courses } = req.body;
    
    if (!courses || !Array.isArray(courses) || courses.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of courses'
      });
    }
    
    // Check for duplicate course codes
    const courseCodes = courses.map(c => c.code);
    const existingCourses = await Course.find({ code: { $in: courseCodes } });
    
    if (existingCourses.length > 0) {
      const existingCodes = existingCourses.map(c => c.code);
      return res.status(400).json({
        success: false,
        message: 'Some course codes already exist',
        duplicates: existingCodes
      });
    }
    
    // Process each course to resolve department names to IDs
    const processedCourses = [];
    for (const course of courses) {
      // Skip if no department provided
      if (!course.department) {
        return res.status(400).json({
          success: false,
          message: `Department is required for course: ${course.code}`
        });
      }
      
      // Resolve department ID
      const departmentId = await resolveDepartmentId(course.department);
      if (!departmentId) {
        return res.status(404).json({
          success: false,
          message: `Department "${course.department}" not found for course: ${course.code}`
        });
      }
      
      processedCourses.push({
        ...course,
        department: departmentId
      });
    }
    
    // Create all courses
    const createdCourses = await Course.insertMany(processedCourses);
    
    // Update lecturer references
    const lecturerUpdates = courses
      .filter(c => c.lecturer)
      .map((c, index) => {
        const courseObj = createdCourses[index];
        return Lecturer.findByIdAndUpdate(
          c.lecturer,
          { $addToSet: { courses: courseObj._id } }
        );
      });
    
    await Promise.all(lecturerUpdates);
    
    res.status(201).json({
      success: true,
      message: `${createdCourses.length} courses created successfully`,
      data: createdCourses
    });
  } catch (error) {
    console.error('Error bulk creating courses:', error);
    res.status(500).json({
      success: false,
      message: 'Error bulk creating courses',
      error: error.message
    });
  }
};

/**
 * @desc    Bulk update multiple courses
 * @route   POST /api/courses/bulk-update
 * @access  Private/Admin
 */
exports.bulkUpdateCourses = async (req, res) => {
  try {
    const { courses } = req.body;
    
    if (!courses || !Array.isArray(courses) || courses.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of courses to update'
      });
    }
    
    // Make sure each course has an ID
    const coursesWithIds = courses.filter(c => c._id);
    
    if (coursesWithIds.length !== courses.length) {
      return res.status(400).json({
        success: false,
        message: 'Each course must have an _id field'
      });
    }
    
    // Update each course and track lecturer changes
    const updateResults = [];
    const lecturerChanges = [];
    
    for (const course of coursesWithIds) {
      // Get current course data to check for lecturer change
      const currentCourse = await Course.findById(course._id);
      if (!currentCourse) {
        updateResults.push({
          _id: course._id,
          success: false,
          message: 'Course not found'
        });
        continue;
      }
      
      // Track lecturer change if applicable
      if (course.lecturer && currentCourse.lecturer && 
          course.lecturer.toString() !== currentCourse.lecturer.toString()) {
        lecturerChanges.push({
          courseId: course._id,
          oldLecturer: currentCourse.lecturer,
          newLecturer: course.lecturer
        });
      } else if (course.lecturer && !currentCourse.lecturer) {
        lecturerChanges.push({
          courseId: course._id,
          oldLecturer: null,
          newLecturer: course.lecturer
        });
      } else if (!course.lecturer && currentCourse.lecturer) {
        lecturerChanges.push({
          courseId: course._id,
          oldLecturer: currentCourse.lecturer,
          newLecturer: null
        });
      }
      
      // Update the course
      try {
        const updatedCourse = await Course.findByIdAndUpdate(
          course._id,
          { $set: course },
          { new: true }
        );
        
        updateResults.push({
          _id: course._id,
          success: true,
          course: updatedCourse
        });
      } catch (err) {
        updateResults.push({
          _id: course._id,
          success: false,
          message: err.message
        });
      }
    }
    
    // Process lecturer changes
    for (const change of lecturerChanges) {
      // Remove course from old lecturer
      if (change.oldLecturer) {
        await Lecturer.findByIdAndUpdate(
          change.oldLecturer,
          { $pull: { courses: change.courseId } }
        );
      }
      
      // Add course to new lecturer
      if (change.newLecturer) {
        await Lecturer.findByIdAndUpdate(
          change.newLecturer,
          { $addToSet: { courses: change.courseId } }
        );
      }
    }
    
    const successCount = updateResults.filter(r => r.success).length;
    
    res.status(200).json({
      success: true,
      message: `${successCount} out of ${courses.length} courses updated successfully`,
      data: updateResults
    });
  } catch (error) {
    console.error('Error bulk updating courses:', error);
    res.status(500).json({
      success: false,
      message: 'Error bulk updating courses',
      error: error.message
    });
  }
};

/**
 * @desc    Bulk delete multiple courses
 * @route   POST /api/courses/bulk-delete
 * @access  Private/Admin
 */
exports.bulkDeleteCourses = async (req, res) => {
  try {
    const { courseIds } = req.body;
    
    if (!courseIds || !Array.isArray(courseIds) || courseIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of course IDs'
      });
    }
    
    // Get courses to get lecturer references
    const courses = await Course.find({ _id: { $in: courseIds } });
    
    // Get unique lecturer IDs
    const lecturerIds = [...new Set(
      courses
        .filter(c => c.lecturer)
        .map(c => c.lecturer.toString())
    )];
    
    // Delete courses
    await Course.deleteMany({ _id: { $in: courseIds } });
    
    // Update lecturer references
    const lecturerUpdates = lecturerIds.map(lecturerId =>
      Lecturer.findByIdAndUpdate(
        lecturerId,
        { $pull: { courses: { $in: courseIds } } }
      )
    );
    
    // Update student references
    await Student.updateMany(
      { courses: { $in: courseIds } },
      { $pull: { courses: { $in: courseIds } } }
    );
    
    await Promise.all(lecturerUpdates);
    
    res.status(200).json({
      success: true,
      message: `${courseIds.length} courses deleted successfully`,
      data: {
        deletedCount: courseIds.length,
        courseIds
      }
    });
  } catch (error) {
    console.error('Error bulk deleting courses:', error);
    res.status(500).json({
      success: false,
      message: 'Error bulk deleting courses',
      error: error.message
    });
  }
};

/**
 * @desc    Get course statistics
 * @route   GET /api/courses/statistics
 * @access  Private/Admin
 */
exports.getCourseStatistics = async (req, res) => {
  try {
    // Get total number of courses
    const totalCourses = await Course.countDocuments();
    
    // Get courses per department
    const coursesPerDepartment = await Course.aggregate([
      { 
        $group: { 
          _id: '$department', 
          count: { $sum: 1 },
          courses: { $push: { id: '$_id', code: '$code', title: '$title' } }
        } 
      },
      { $sort: { count: -1 } }
    ]);
    
    // Get department details
    const departmentIds = coursesPerDepartment.map(dept => dept._id);
    const departments = await Department.find({ _id: { $in: departmentIds } });
    
    // Map department details to statistics
    const departmentStats = coursesPerDepartment.map(dept => {
      const departmentDetails = departments.find(
        d => d._id.toString() === dept._id.toString()
      );
      return {
        department: departmentDetails ? {
          _id: departmentDetails._id,
          name: departmentDetails.name,
          code: departmentDetails.code
        } : { _id: dept._id, name: 'Unknown Department' },
        courseCount: dept.count,
        courses: dept.courses
      };
    });
    
    // Get courses per academic level
    const coursesPerLevel = await Course.aggregate([
      { 
        $group: { 
          _id: '$level', 
          count: { $sum: 1 } 
        } 
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Get courses with highest enrollment
    const enrollmentPerCourse = await Student.aggregate([
      { $unwind: '$courses' },
      { 
        $group: { 
          _id: '$courses', 
          studentCount: { $sum: 1 } 
        } 
      },
      { $sort: { studentCount: -1 } },
      { $limit: 10 }
    ]);
    
    // Get course details for enrollment stats
    const courseIds = enrollmentPerCourse.map(item => item._id);
    const topCourses = await Course.find(
      { _id: { $in: courseIds } },
      'code title level department'
    );
    
    // Map course details to enrollment stats
    const enrollmentStats = enrollmentPerCourse.map(item => {
      const course = topCourses.find(c => c._id.toString() === item._id.toString());
      return {
        course: course ? {
          _id: course._id,
          code: course.code,
          title: course.title,
          level: course.level
        } : { _id: item._id, title: 'Unknown Course' },
        studentCount: item.studentCount
      };
    });
    
    // Get lecturer course assignment stats
    const lecturerCourseStats = await Lecturer.aggregate([
      { $project: { _id: 1, coursesCount: { $size: '$courses' } } },
      { $sort: { coursesCount: -1 } },
      { $limit: 10 }
    ]);
    
    // Get lecturer details
    const lecturerIds = lecturerCourseStats.map(item => item._id);
    const topLecturers = await Lecturer.find(
      { _id: { $in: lecturerIds } }
    ).populate('user', 'name email');
    
    // Map lecturer details to stats
    const lecturerStats = lecturerCourseStats.map(item => {
      const lecturer = topLecturers.find(l => l._id.toString() === item._id.toString());
      return {
        lecturer: lecturer ? {
          _id: lecturer._id,
          name: lecturer.user?.name || 'Unknown',
          email: lecturer.user?.email
        } : { _id: item._id, name: 'Unknown Lecturer' },
        coursesCount: item.coursesCount
      };
    });
    
    res.status(200).json({
      success: true,
      data: {
        totalCourses,
        departmentStats,
        coursesPerLevel,
        topEnrollments: enrollmentStats,
        topLecturers: lecturerStats
      }
    });
  } catch (error) {
    console.error('Error getting course statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting course statistics',
      error: error.message
    });
  }
};