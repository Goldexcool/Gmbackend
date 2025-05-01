const Assignment = require('../models/Assignment');
const Course = require('../models/Course');
const Lecturer = require('../models/Lecturer');
const Student = require('../models/Student');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');

// ==================== LECTURER FUNCTIONS ====================

// @desc    Create assignment
// @route   POST /api/courses/:courseId/assignments
// @access  Private/Lecturer
exports.createAssignment = async (req, res) => {
  try {
    const { courseId } = req.params;
    const {
      title,
      description,
      dueDate,
      totalPoints,
      instructions,
      allowLateSubmission,
      latePenalty,
      academicSession,
      submissionType,
      gradingScheme,
      visibleToStudents
    } = req.body;
    
    // Validate required fields
    if (!title || !description || !dueDate) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title, description, and due date'
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
    
    // Get lecturer profile
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found'
      });
    }
    
    // Check if lecturer teaches this course
    const isTeaching = course.lecturer.some(id => id.toString() === lecturer._id.toString());
    if (!isTeaching && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to create assignments for this course'
      });
    }
    
    // Process uploaded files if any
    const files = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        files.push({
          filename: file.originalname,
          fileUrl: `/uploads/assignments/${file.filename}`,
          mimeType: file.mimetype,
          size: file.size
        });
      });
    }
    
    // Create assignment
    const assignment = new Assignment({
      title,
      description,
      course: courseId,
      academicSession: academicSession || course.academicSession,
      lecturer: lecturer._id,
      dueDate: new Date(dueDate),
      totalPoints: totalPoints || 100,
      instructions,
      allowLateSubmission: allowLateSubmission !== undefined ? allowLateSubmission : false,
      latePenalty: latePenalty || 0,
      files,
      submissionType: submissionType || 'file',
      gradingScheme: gradingScheme || 'points',
      visibleToStudents: visibleToStudents !== undefined ? visibleToStudents : true,
      isPublished: true,
      publishedAt: new Date()
    });
    
    await assignment.save();
    
    res.status(201).json({
      success: true,
      data: assignment
    });
  } catch (error) {
    console.error('Error creating assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating assignment',
      error: error.message
    });
  }
};

// @desc    Get assignments for a course
// @route   GET /api/courses/:courseId/assignments
// @access  Private/Lecturer
exports.getLecturerCourseAssignments = async (req, res) => {
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
    
    // Get lecturer profile
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found'
      });
    }
    
    // Check if lecturer teaches this course (skip check for admin)
    const isTeaching = course.lecturer.some(id => id.toString() === lecturer._id.toString());
    if (!isTeaching && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view assignments for this course'
      });
    }
    
    // Find assignments
    const assignments = await Assignment.find({
      course: courseId,
      lecturer: lecturer._id
    })
    .sort('-createdAt');
    
    res.status(200).json({
      success: true,
      count: assignments.length,
      data: assignments
    });
  } catch (error) {
    console.error('Error getting assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting assignments',
      error: error.message
    });
  }
};

// @desc    Get all assignments by lecturer
// @route   GET /api/lecturer/assignments
// @access  Private/Lecturer
exports.getLecturerAssignments = async (req, res) => {
  try {
    const { course, academicSession } = req.query;
    
    // Get lecturer profile
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found'
      });
    }
    
    // Build query
    const query = { lecturer: lecturer._id };
    
    // Add optional filters
    if (course) query.course = course;
    if (academicSession) query.academicSession = academicSession;
    
    // Find assignments
    const assignments = await Assignment.find(query)
      .populate('course', 'code title')
      .populate('academicSession', 'name year')
      .sort('-createdAt');
    
    res.status(200).json({
      success: true,
      count: assignments.length,
      data: assignments
    });
  } catch (error) {
    console.error('Error getting assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting assignments',
      error: error.message
    });
  }
};

// @desc    Get a single assignment
// @route   GET /api/assignments/:id
// @access  Private
exports.getAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find assignment
    const assignment = await Assignment.findById(id)
      .populate('course', 'code title')
      .populate('academicSession', 'name year')
      .populate('lecturer', 'user')
      .populate({
        path: 'lecturer.user',
        select: 'name email'
      });
    
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }
    
    // Handle access control based on user role
    if (req.user.role === 'lecturer') {
      // For lecturers: Check if they created the assignment
      const lecturer = await Lecturer.findOne({ user: req.user.id });
      if (!lecturer || lecturer._id.toString() !== assignment.lecturer._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to view this assignment'
        });
      }
    } else if (req.user.role === 'student') {
      // For students: Check if they're enrolled in the course and assignment is visible
      if (!assignment.visibleToStudents) {
        return res.status(403).json({
          success: false,
          message: 'This assignment is not available to students'
        });
      }
      
      const student = await Student.findOne({ user: req.user.id });
      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student profile not found'
        });
      }
      
      // Check if enrolled in course
      const isEnrolled = student.courses.some(c => c.toString() === assignment.course._id.toString());
      if (!isEnrolled) {
        return res.status(403).json({
          success: false,
          message: 'You are not enrolled in this course'
        });
      }
      
      // Find student's submission
      const submission = assignment.submissions.find(
        sub => sub.student.toString() === student._id.toString()
      );
      
      // Add submission info to response
      assignment._doc.studentSubmission = submission || null;
    }
    
    res.status(200).json({
      success: true,
      data: assignment
    });
  } catch (error) {
    console.error('Error getting assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting assignment',
      error: error.message
    });
  }
};

// @desc    Update assignment
// @route   PUT /api/assignments/:id
// @access  Private/Lecturer
exports.updateAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      dueDate,
      totalPoints,
      instructions,
      allowLateSubmission,
      latePenalty,
      submissionType,
      gradingScheme,
      visibleToStudents
    } = req.body;
    
    // Find lecturer
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found'
      });
    }
    
    // Find assignment
    const assignment = await Assignment.findOne({
      _id: id,
      lecturer: lecturer._id
    });
    
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found or you are not authorized to update it'
      });
    }
    
    // Update fields if provided
    if (title !== undefined) assignment.title = title;
    if (description !== undefined) assignment.description = description;
    if (dueDate !== undefined) assignment.dueDate = new Date(dueDate);
    if (totalPoints !== undefined) assignment.totalPoints = totalPoints;
    if (instructions !== undefined) assignment.instructions = instructions;
    if (allowLateSubmission !== undefined) assignment.allowLateSubmission = allowLateSubmission;
    if (latePenalty !== undefined) assignment.latePenalty = latePenalty;
    if (submissionType !== undefined) assignment.submissionType = submissionType;
    if (gradingScheme !== undefined) assignment.gradingScheme = gradingScheme;
    if (visibleToStudents !== undefined) assignment.visibleToStudents = visibleToStudents;
    
    // Process uploaded files if any
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        assignment.files.push({
          filename: file.originalname,
          fileUrl: `/uploads/assignments/${file.filename}`,
          mimeType: file.mimetype,
          size: file.size
        });
      });
    }
    
    await assignment.save();
    
    res.status(200).json({
      success: true,
      data: assignment
    });
  } catch (error) {
    console.error('Error updating assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating assignment',
      error: error.message
    });
  }
};

// @desc    Delete assignment
// @route   DELETE /api/assignments/:id
// @access  Private/Lecturer
exports.deleteAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find lecturer
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found'
      });
    }
    
    // Find assignment
    const assignment = await Assignment.findOne({
      _id: id,
      lecturer: lecturer._id
    });
    
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found or you are not authorized to delete it'
      });
    }
    
    // Check if assignment has submissions
    if (assignment.submissions && assignment.submissions.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete assignment with submissions'
      });
    }
    
    // Delete assignment files from disk
    if (assignment.files && assignment.files.length > 0) {
      assignment.files.forEach(file => {
        const filePath = path.join(__dirname, '..', 'uploads', 'assignments', path.basename(file.fileUrl));
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    }
    
    await assignment.deleteOne();
    
    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    console.error('Error deleting assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting assignment',
      error: error.message
    });
  }
};

// @desc    Get all submissions for an assignment
// @route   GET /api/assignments/:id/submissions
// @access  Private/Lecturer
exports.getSubmissions = async (req, res) => {
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
    const assignment = await Assignment.findOne({
      _id: id,
      lecturer: lecturer._id
    });
    
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found or you do not have permission to view it'
      });
    }
    
    // Get student details for each submission
    const populatedSubmissions = await Promise.all(assignment.submissions.map(async (submission) => {
      const student = await Student.findById(submission.student).populate('user', 'name email');
      return {
        ...submission.toObject(),
        student: {
          _id: student._id,
          name: student.user.name,
          email: student.user.email,
          matricNumber: student.matricNumber
        }
      };
    }));
    
    res.status(200).json({
      success: true,
      count: populatedSubmissions.length,
      data: populatedSubmissions
    });
  } catch (error) {
    console.error('Error getting submissions:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting submissions',
      error: error.message
    });
  }
};

// ==================== STUDENT FUNCTIONS ====================

// @desc    Submit assignment
// @route   POST /api/student/assignments/:id/submit
// @access  Private/Student
exports.submitAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const { comments } = req.body;
    
    // Find assignment
    const assignment = await Assignment.findById(id);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }
    
    // Check if assignment is visible to students
    if (!assignment.visibleToStudents) {
      return res.status(403).json({
        success: false,
        message: 'This assignment is not available for submission'
      });
    }
    
    // Find student
    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }
    
    // Check if student is enrolled in course
    const isEnrolled = student.courses.some(
      courseId => courseId.toString() === assignment.course.toString()
    );
    
    if (!isEnrolled) {
      return res.status(403).json({
        success: false,
        message: 'You are not enrolled in this course'
      });
    }
    
    // Check if submission is on time or late
    const now = new Date();
    const isLate = now > assignment.dueDate;
    
    if (isLate && !assignment.allowLateSubmission) {
      return res.status(400).json({
        success: false,
        message: 'Submission deadline has passed and late submissions are not allowed'
      });
    }
    
    // Check if student has already submitted
    const existingSubmissionIndex = assignment.submissions.findIndex(
      sub => sub.student.toString() === student._id.toString()
    );
    
    // If student already submitted, return error (use updateSubmission for updates)
    if (existingSubmissionIndex !== -1) {
      return res.status(400).json({
        success: false,
        message: 'You have already submitted this assignment. Use the update submission endpoint to make changes.'
      });
    }
    
    // Process uploaded files
    const files = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        files.push({
          filename: file.originalname,
          fileUrl: `/uploads/submissions/${file.filename}`,
          mimeType: file.mimetype,
          size: file.size
        });
      });
    } else if (assignment.submissionType === 'file' || assignment.submissionType === 'both') {
      // Check if files are required
      return res.status(400).json({
        success: false,
        message: 'Please upload at least one file'
      });
    }
    
    // Create submission object
    const submission = {
      student: student._id,
      submittedAt: now,
      files,
      comments,
      status: isLate ? 'late' : 'submitted'
    };
    
    // Add submission
    assignment.submissions.push(submission);
    
    await assignment.save();
    
    // Create task for the student to track the submission
    try {
      const Task = require('../models/Task');
      
      // Create a completed task for this assignment submission
      await Task.create({
        title: `Submit ${assignment.title}`,
        description: `Submission for ${assignment.title} in ${assignment.course.code}`,
        dueDate: assignment.dueDate,
        priority: 'high',
        category: 'academic',
        relatedCourse: assignment.course,
        relatedAssignment: assignment._id,
        student: student._id,
        status: 'completed',
        completedAt: now
      });
    } catch (err) {
      // Don't fail if task creation fails
      console.error('Error creating task for assignment submission:', err);
    }
    
    res.status(201).json({
      success: true,
      message: isLate ? 'Assignment submitted late' : 'Assignment submitted successfully',
      data: submission
    });
  } catch (error) {
    console.error('Error submitting assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting assignment',
      error: error.message
    });
  }
};

/**
 * @desc    Update assignment submission
 * @route   PUT /api/student/assignments/:id/submit
 * @access  Private/Student
 */
exports.updateSubmission = async (req, res) => {
  try {
    const { id } = req.params;
    const { comments } = req.body;
    
    // Find assignment
    const assignment = await Assignment.findById(id);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }
    
    // Check if assignment is visible to students
    if (!assignment.visibleToStudents) {
      return res.status(403).json({
        success: false,
        message: 'This assignment is not available for submission'
      });
    }
    
    // Find student
    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }
    
    // Check if submission is on time or late
    const now = new Date();
    const isLate = now > assignment.dueDate;
    
    if (isLate && !assignment.allowLateSubmission) {
      return res.status(400).json({
        success: false,
        message: 'Submission deadline has passed and late submissions are not allowed'
      });
    }
    
    // Check if student has already submitted
    const existingSubmissionIndex = assignment.submissions.findIndex(
      sub => sub.student.toString() === student._id.toString()
    );
    
    // If no existing submission, return error
    if (existingSubmissionIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'No existing submission found. Please use the submit endpoint instead.'
      });
    }
    
    // Check if submission is already graded
    if (assignment.submissions[existingSubmissionIndex].status === 'graded') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update a submission that has already been graded'
      });
    }
    
    // Process uploaded files
    const files = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        files.push({
          filename: file.originalname,
          fileUrl: `/uploads/submissions/${file.filename}`,
          mimeType: file.mimetype,
          size: file.size
        });
      });
      
      // If there are existing files, append new ones
      if (assignment.submissions[existingSubmissionIndex].files && 
          assignment.submissions[existingSubmissionIndex].files.length > 0) {
        files.push(...assignment.submissions[existingSubmissionIndex].files);
      }
    } else {
      // Keep existing files if no new ones uploaded
      files.push(...(assignment.submissions[existingSubmissionIndex].files || []));
    }
    
    // Update submission
    assignment.submissions[existingSubmissionIndex] = {
      ...assignment.submissions[existingSubmissionIndex].toObject(),
      files,
      comments: comments !== undefined ? comments : assignment.submissions[existingSubmissionIndex].comments,
      submittedAt: now, // Update submission time
      status: isLate ? 'late' : 'submitted'
    };
    
    await assignment.save();
    
    res.status(200).json({
      success: true,
      message: 'Submission updated successfully',
      data: assignment.submissions[existingSubmissionIndex]
    });
  } catch (error) {
    console.error('Error updating submission:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating submission',
      error: error.message
    });
  }
};

// @desc    Get student assignments
// @route   GET /api/student/assignments
// @access  Private/Student
exports.getStudentAssignments = async (req, res) => {
  try {
    const { course, status } = req.query;
    
    // Find student
    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }
    
    // Get courses the student is enrolled in
    const courseIds = student.courses;
    
    // Find assignments for these courses that are visible to students
    const query = {
      course: { $in: courseIds },
      visibleToStudents: true
    };
    
    // Add course filter if provided
    if (course) query.course = course;
    
    // Find assignments
    let assignments = await Assignment.find(query)
      .populate('course', 'code title')
      .populate('academicSession', 'name year')
      .sort('-createdAt');
    
    // Process assignments to add submission status
    assignments = assignments.map(assignment => {
      const assignmentObj = assignment.toObject();
      
      // Find this student's submission
      const submission = assignment.submissions.find(
        sub => sub.student.toString() === student._id.toString()
      );
      
      // Add status information
      if (submission) {
        assignmentObj.submissionStatus = {
          status: submission.status,
          submittedAt: submission.submittedAt,
          hasGrade: !!submission.grade?.score
        };
      } else {
        // Check if overdue
        const now = new Date();
        assignmentObj.submissionStatus = {
          status: now > assignment.dueDate ? 'overdue' : 'pending',
          hasGrade: false
        };
      }
      
      // Remove other students' submissions for privacy
      delete assignmentObj.submissions;
      
      return assignmentObj;
    });
    
    // Filter by submission status if requested
    if (status) {
      assignments = assignments.filter(a => a.submissionStatus.status === status);
    }
    
    res.status(200).json({
      success: true,
      count: assignments.length,
      data: assignments
    });
  } catch (error) {
    console.error('Error getting student assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting assignments',
      error: error.message
    });
  }
};

// @desc    Get a single assignment for student with their submission details
// @route   GET /api/student/assignments/:id
// @access  Private/Student
exports.getStudentAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find assignment
    const assignment = await Assignment.findById(id)
      .populate('course', 'code title')
      .populate('academicSession', 'name year')
      .populate('lecturer', 'user')
      .populate({
        path: 'lecturer.user',
        select: 'name email'
      });
    
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }
    
    // Check if assignment is visible to students
    if (!assignment.visibleToStudents) {
      return res.status(403).json({
        success: false,
        message: 'This assignment is not available to students'
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
    
    // Check if student is enrolled in the course
    const isEnrolled = student.courses.some(
      courseId => courseId.toString() === assignment.course._id.toString()
    );
    
    if (!isEnrolled) {
      return res.status(403).json({
        success: false,
        message: 'You are not enrolled in this course'
      });
    }
    
    // Create a sanitized assignment object
    const sanitizedAssignment = assignment.toObject();
    
    // Find the student's submission
    const studentSubmission = assignment.submissions.find(
      submission => submission.student.toString() === student._id.toString()
    );
    
    // Add submission status
    if (studentSubmission) {
      sanitizedAssignment.submission = studentSubmission;
      sanitizedAssignment.submissionStatus = {
        status: studentSubmission.status,
        submittedAt: studentSubmission.submittedAt,
        hasGrade: !!studentSubmission.grade?.score,
        grade: studentSubmission.grade || null
      };
    } else {
      // Check if assignment is overdue
      const now = new Date();
      sanitizedAssignment.submissionStatus = {
        status: now > assignment.dueDate ? 'overdue' : 'pending',
        hasGrade: false,
        grade: null
      };
    }
    
    // Calculate time remaining until due date
    const now = new Date();
    const dueDate = new Date(assignment.dueDate);
    const timeRemaining = dueDate - now;
    
    sanitizedAssignment.timeRemaining = {
      milliseconds: timeRemaining > 0 ? timeRemaining : 0,
      days: Math.floor(timeRemaining / (1000 * 60 * 60 * 24)),
      hours: Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
      minutes: Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60))
    };
    
    sanitizedAssignment.isOverdue = timeRemaining < 0;
    sanitizedAssignment.canSubmit = 
      !sanitizedAssignment.isOverdue || assignment.allowLateSubmission;
    
    // Remove other students' submissions for privacy
    delete sanitizedAssignment.submissions;
    
    res.status(200).json({
      success: true,
      data: sanitizedAssignment
    });
  } catch (error) {
    console.error('Error getting assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting assignment',
      error: error.message
    });
  }
};

// @desc    Grade a submission
// @route   POST /api/assignments/:id/submissions/:submissionId/grade
// @access  Private/Lecturer
exports.gradeSubmission = async (req, res) => {
  try {
    const { id, submissionId } = req.params;
    const { score, feedback } = req.body;
    
    // Validate input
    if (score === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a score'
      });
    }
    
    // Find lecturer
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found'
      });
    }
    
    // Find assignment
    const assignment = await Assignment.findOne({
      _id: id,
      lecturer: lecturer._id
    });
    
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found or you are not authorized to grade it'
      });
    }
    
    // Find submission
    const submissionIndex = assignment.submissions.findIndex(
      sub => sub._id.toString() === submissionId
    );
    
    if (submissionIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }
    
    // Update grade
    assignment.submissions[submissionIndex].grade = {
      score: Math.min(score, assignment.totalPoints), // Ensure score doesn't exceed total points
      feedback: feedback || '',
      gradedBy: lecturer._id,
      gradedAt: new Date()
    };
    
    // Update submission status
    assignment.submissions[submissionIndex].status = 'graded';
    
    await assignment.save();
    
    res.status(200).json({
      success: true,
      data: assignment.submissions[submissionIndex]
    });
  } catch (error) {
    console.error('Error grading submission:', error);
    res.status(500).json({
      success: false,
      message: 'Error grading submission',
      error: error.message
    });
  }
};