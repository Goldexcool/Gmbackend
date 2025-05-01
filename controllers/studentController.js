// controllers/studentController.js
const Student = require('../models/Student');
const User = require('../models/User');
const Task = require('../models/Task');
const Schedule = require('../models/Schedule');
const StudyGroup = require('../models/StudyGroup');
const Chat = require('../models/Chat');
const Course = require('../models/Course');
const AcademicSession = require('../models/AcademicSession');
const path = require('path');
const fs = require('fs');

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

// @desc    Get all departments for students
// @route   GET /api/users/departments
// @access  Private (Student only)
exports.getDepartments = async (req, res) => {
  try {
    // Get unique departments from courses with active status
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

// @desc    Get department details for students
// @route   GET /api/users/departments/:departmentName
// @access  Private (Student only)
exports.getDepartmentDetails = async (req, res) => {
  try {
    const { departmentName } = req.params;
    
    // Get active courses for the department
    const courses = await Course.find({ 
      department: departmentName,
      isActive: true
    }).select('name code credits description semester level');
    
    if (courses.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Department '${departmentName}' not found or has no active courses`
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        name: departmentName,
        courses,
        courseCount: courses.length
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

// @desc    Get courses available for student's department and level
// @route   GET /api/student/courses/available
// @access  Private/Student
exports.getAvailableCourses = async (req, res) => {
  try {
    // Find student profile
    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }
    
    // Get active academic session
    const activeSession = await AcademicSession.findOne({ isActive: true });
    if (!activeSession) {
      return res.status(404).json({
        success: false,
        message: 'No active academic session found'
      });
    }
    
    // Find courses for student's department and level
    const availableCourses = await Course.find({
      department: student.department,
      level: student.level,
      academicSession: activeSession._id,
      isActive: true
    })
    .populate({
      path: 'lecturer',
      select: 'user',
      populate: {
        path: 'user',
        select: 'name'
      }
    });
    
    // Add enrollment status
    const coursesWithStatus = availableCourses.map(course => {
      const courseObj = course.toObject();
      courseObj.isEnrolled = student.courses.includes(course._id);
      return courseObj;
    });
    
    res.status(200).json({
      success: true,
      count: coursesWithStatus.length,
      data: coursesWithStatus
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

// @desc    Enroll in a course
// @route   POST /api/student/courses/:courseId/enroll
// @access  Private/Student
exports.enrollInCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    
    // Find student profile
    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
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
    
    // Check if course is for student's department and level
    if (course.department !== student.department || course.level !== student.level) {
      return res.status(403).json({
        success: false,
        message: 'This course is not available for your department or level'
      });
    }
    
    // Check if student is already enrolled
    if (student.courses.includes(courseId)) {
      return res.status(400).json({
        success: false,
        message: 'You are already enrolled in this course'
      });
    }
    
    // Add course to student's enrolled courses
    student.courses.push(courseId);
    await student.save();
    
    res.status(200).json({
      success: true,
      message: 'Successfully enrolled in course',
      data: {
        courseId,
        courseTitle: course.title,
        courseCode: course.code
      }
    });
  } catch (error) {
    console.error('Error enrolling in course:', error);
    res.status(500).json({
      success: false,
      message: 'Error enrolling in course',
      error: error.message
    });
  }
};

// @desc    Drop a course
// @route   DELETE /api/student/courses/:courseId/enroll
// @access  Private/Student
exports.dropCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    
    // Find student profile
    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }
    
    // Check if student is enrolled
    if (!student.courses.includes(courseId)) {
      return res.status(400).json({
        success: false,
        message: 'You are not enrolled in this course'
      });
    }
    
    // Remove course from student's enrolled courses
    student.courses = student.courses.filter(
      course => course.toString() !== courseId
    );
    await student.save();
    
    res.status(200).json({
      success: true,
      message: 'Successfully dropped course',
      data: {}
    });
  } catch (error) {
    console.error('Error dropping course:', error);
    res.status(500).json({
      success: false,
      message: 'Error dropping course',
      error: error.message
    });
  }
};

// @desc    Get courses for a specific department and level
// @route   GET /api/student/courses/department
// @access  Private/Student
exports.getCoursesByDepartmentAndLevel = async (req, res) => {
  try {
    const { department, level } = req.query;
    
    if (!department || !level) {
      return res.status(400).json({
        success: false,
        message: 'Please provide department and level'
      });
    }
    
    // Get active academic session
    const activeSession = await AcademicSession.findOne({ isActive: true });
    if (!activeSession) {
      return res.status(404).json({
        success: false,
        message: 'No active academic session found'
      });
    }
    
    // Find courses
    const courses = await Course.find({
      department,
      level,
      academicSession: activeSession._id,
      isActive: true
    })
    .populate({
      path: 'lecturer',
      select: 'user',
      populate: {
        path: 'user',
        select: 'name'
      }
    });
    
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
 * @desc    Update student profile
 * @route   PUT /api/student/profile
 * @access  Private/Student
 */
exports.updateStudentProfile = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phoneNumber,
      department,
      level,
      matricNumber,
      bio,
      interests,
      birthDate,
      address,
      emergencyContact
    } = req.body;

    // Find student profile by user ID
    const student = await Student.findOne({ user: req.user.id });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
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

    // Update student profile fields if provided
    if (phoneNumber !== undefined) student.phoneNumber = phoneNumber;
    if (bio !== undefined) student.bio = bio;
    if (interests !== undefined) {
      // Handle interests as an array
      student.interests = Array.isArray(interests) ? interests : interests.split(',').map(i => i.trim());
    }
    if (birthDate !== undefined) student.birthDate = birthDate ? new Date(birthDate) : student.birthDate;
    
    // Update address if provided
    if (address) {
      student.address = {
        ...student.address || {},
        ...address
      };
    }

    // Update emergency contact if provided
    if (emergencyContact) {
      student.emergencyContact = {
        ...student.emergencyContact || {},
        ...emergencyContact
      };
    }

    // Special handling for academic information - these might require approval
    const updatesRequiringApproval = {};
    let requiresApproval = false;

    // Department and level changes should be tracked
    if (department && department !== student.department) {
      updatesRequiringApproval.department = department;
      requiresApproval = true;
    }

    if (level && level !== student.level) {
      updatesRequiringApproval.level = level;
      requiresApproval = true;
    }

    if (matricNumber && matricNumber !== student.matricNumber) {
      updatesRequiringApproval.matricNumber = matricNumber;
      requiresApproval = true;
    }

    // If updates require approval, store them separately
    if (requiresApproval) {
      student.pendingUpdates = {
        ...student.pendingUpdates || {},
        ...updatesRequiringApproval,
        requestedAt: new Date(),
        status: 'pending'
      };
      
      // Here you could implement notifications to admins about pending changes
    } else {
      // If no approval needed, apply updates directly
      if (department) student.department = department;
      if (level) student.level = level;
      if (matricNumber) student.matricNumber = matricNumber;
    }

    // Handle profile picture upload if included
    if (req.file) {
      // Delete old profile picture if exists
      if (student.profilePicture && student.profilePicture.fileUrl) {
        const oldFilePath = path.join(__dirname, '..', student.profilePicture.fileUrl);
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      }

      student.profilePicture = {
        filename: req.file.originalname,
        fileUrl: `/uploads/profiles/${req.file.filename}`,
        mimeType: req.file.mimetype,
        size: req.file.size
      };
    }

    // Save updated student profile
    await student.save();

    // Return updated profile
    const updatedStudent = await Student.findById(student._id)
      .populate('user', 'name email')
      .populate('courses', 'code title');

    res.status(200).json({
      success: true,
      message: requiresApproval 
        ? 'Profile updated. Some changes require approval and are pending review.' 
        : 'Profile updated successfully',
      data: updatedStudent,
      pendingChanges: requiresApproval ? updatesRequiringApproval : null
    });
  } catch (error) {
    console.error('Error updating student profile:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating student profile',
      error: error.message
    });
  }
};

/**
 * @desc    Get student's enrolled courses
 * @route   GET /api/student/courses
 * @access  Private/Student
 */
exports.getEnrolledCourses = async (req, res) => {
  try {
    // Find student profile with populated courses
    const student = await Student.findOne({ user: req.user.id })
      .populate({
        path: 'courses',
        populate: [
          { 
            path: 'academicSession',
            select: 'name year isActive'
          },
          {
            path: 'lecturer',
            select: 'user',
            populate: {
              path: 'user',
              select: 'name email'
            }
          }
        ]
      });
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }
    
    // Get active academic session for filtering
    const activeSession = await AcademicSession.findOne({ isActive: true });
    
    // Process courses to include additional info
    const processedCourses = await Promise.all(student.courses.map(async (course) => {
      const courseObj = course.toObject();
      
      // Check for course representative
      const CourseRepresentative = require('../models/CourseRepresentative');
      const courseRep = await CourseRepresentative.findOne({
        course: course._id,
        academicSession: course.academicSession,
        isActive: true
      }).populate('student', 'user').populate('student.user', 'name email');
      
      // Get assignment stats
      const Assignment = require('../models/Assignment');
      const assignments = await Assignment.find({
        course: course._id,
        academicSession: course.academicSession,
        visibleToStudents: true
      });
      
      // Count pending assignments
      const now = new Date();
      const pendingAssignments = assignments.filter(assignment => {
        // Check if student has submitted this assignment
        const submitted = assignment.submissions.some(
          sub => sub.student.toString() === student._id.toString()
        );
        return !submitted && new Date(assignment.dueDate) > now;
      }).length;
      
      // Count completed assignments
      const completedAssignments = assignments.filter(assignment => {
        return assignment.submissions.some(
          sub => sub.student.toString() === student._id.toString()
        );
      }).length;
      
      // Count resources
      const CourseResource = require('../models/CourseResource');
      const resourceCount = await CourseResource.countDocuments({
        course: course._id,
        academicSession: course.academicSession,
        visibleToStudents: true
      });
      
      // Add additional information
      courseObj.isCurrentSemester = 
        activeSession && course.academicSession._id.toString() === activeSession._id.toString();
      courseObj.courseRepresentative = courseRep ? courseRep.student : null;
      courseObj.stats = {
        pendingAssignments,
        completedAssignments,
        totalAssignments: assignments.length,
        resourceCount
      };
      
      return courseObj;
    }));
    
    // Group courses by academic session
    const coursesBySession = {};
    
    processedCourses.forEach(course => {
      const sessionId = course.academicSession._id.toString();
      if (!coursesBySession[sessionId]) {
        coursesBySession[sessionId] = {
          session: course.academicSession,
          courses: []
        };
      }
      coursesBySession[sessionId].courses.push(course);
    });
    
    // Convert to array for response
    const coursesResponse = Object.values(coursesBySession);
    
    res.status(200).json({
      success: true,
      count: processedCourses.length,
      data: coursesResponse
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
 * @desc    Get details of a specific course
 * @route   GET /api/student/courses/:id
 * @access  Private/Student
 */
exports.getCourseDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find student profile
    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }
    
    // Check if student is enrolled in the course
    const isEnrolled = student.courses.some(courseId => courseId.toString() === id);
    if (!isEnrolled) {
      return res.status(403).json({
        success: false,
        message: 'You are not enrolled in this course'
      });
    }
    
    // Get course with detailed information
    const course = await Course.findById(id)
      .populate({
        path: 'lecturer',
        select: 'user',
        populate: {
          path: 'user',
          select: 'name email'
        }
      })
      .populate('academicSession', 'name year isActive');
    
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Get course representative
    const CourseRepresentative = require('../models/CourseRepresentative');
    const courseRep = await CourseRepresentative.findOne({
      course: course._id,
      academicSession: course.academicSession,
      isActive: true
    })
    .populate({
      path: 'student',
      select: 'user',
      populate: {
        path: 'user',
        select: 'name email'
      }
    })
    .populate({
      path: 'assignedBy',
      select: 'user',
      populate: {
        path: 'user',
        select: 'name'
      }
    });
    
    // Get assignments for this course
    const Assignment = require('../models/Assignment');
    const assignments = await Assignment.find({
      course: course._id,
      academicSession: course.academicSession,
      visibleToStudents: true
    })
    .sort('dueDate');
    
    // Process assignments to include submission status for this student
    const processedAssignments = assignments.map(assignment => {
      const assignmentObj = assignment.toObject();
      
      // Find this student's submission if any
      const submission = assignment.submissions.find(
        sub => sub.student.toString() === student._id.toString()
      );
      
      // Add submission status
      if (submission) {
        assignmentObj.submissionStatus = {
          status: submission.status,
          submittedAt: submission.submittedAt,
          hasGrade: !!submission.grade?.score,
          grade: submission.grade || null
        };
      } else {
        // Check if overdue
        const now = new Date();
        assignmentObj.submissionStatus = {
          status: now > assignment.dueDate ? 'overdue' : 'pending',
          hasGrade: false,
          grade: null
        };
      }
      
      // Remove other students' submissions for privacy
      delete assignmentObj.submissions;
      
      return assignmentObj;
    });
    
    // Get course resources
    const CourseResource = require('../models/CourseResource');
    const resources = await CourseResource.find({
      course: course._id,
      academicSession: course.academicSession,
      visibleToStudents: true
    })
    .sort('-uploadedAt');
    
    // Get other enrolled students (limit to avoid large response)
    const enrolledStudents = await Student.find({
      courses: course._id,
      _id: { $ne: student._id }
    })
    .limit(20)
    .populate('user', 'name');
    
    // Create combined response
    const courseDetails = {
      ...course.toObject(),
      courseRepresentative: courseRep,
      assignments: processedAssignments,
      resources: resources,
      enrolledStudents: enrolledStudents.map(s => ({
        _id: s._id,
        name: s.user.name,
        department: s.department,
        level: s.level
      })),
      enrollmentCount: enrolledStudents.length + 1 // +1 for the current student
    };
    
    res.status(200).json({
      success: true,
      data: courseDetails
    });
  } catch (error) {
    console.error('Error getting course details:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting course details',
      error: error.message
    });
  }
};