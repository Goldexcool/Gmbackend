const Assignment = require('../models/Assignment');
const Course = require('../models/Course');
const Lecturer = require('../models/Lecturer');
const Student = require('../models/Student');
const User = require('../models/User');
const Department = require('../models/Department');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
// ==================== LECTURER FUNCTIONS ====================

/**
 * @desc    Create a new assignment
 * @route   POST /api/lecturer/assignments
 * @access  Private/Lecturer
 */
exports.createAssignment = async (req, res) => {
  try {
    // Find lecturer profile using the authenticated user's ID
    let lecturer = await Lecturer.findOne({ user: req.user.id });

    // If no lecturer profile exists but user has lecturer role, create one
    if (!lecturer && req.user.role === 'lecturer') {
      try {
        // Check if a department is provided or use a default department
        const department = await Department.findOne();
        if (!department) {
          return res.status(404).json({
            success: false,
            message: 'No departments found in the system. Please contact an administrator.'
          });
        }

        // Create a temporary lecturer profile
        lecturer = await Lecturer.create({
          user: req.user.id,
          staffId: `TEMP-${Date.now()}`, // Generate a temporary staff ID
          department: department._id,
          specialization: 'Temporary Profile - Update Required',
          isTemporary: true // Flag to indicate this is a temporary profile
        });

        console.log(`Created temporary lecturer profile for user ${req.user.id}`);
        
        // Notify admin about temporary profile
        try {
          const adminUsers = await User.find({ role: 'admin' });
          if (adminUsers.length > 0) {
            const notifications = adminUsers.map(admin => ({
              recipient: admin._id,
              type: 'system_alert',
              message: `Temporary lecturer profile created for ${req.user.email}. Please update with correct information.`,
              referenceId: lecturer._id,
              referenceModel: 'Lecturer'
            }));
            
            // Insert notifications if a Notification model exists
            if (global.models && global.models.Notification) {
              await global.models.Notification.insertMany(notifications);
            }
          }
        } catch (notifyError) {
          console.error('Error notifying admins about temporary profile:', notifyError);
        }
      } catch (profileError) {
        console.error('Error creating temporary lecturer profile:', profileError);
        return res.status(500).json({
          success: false,
          message: 'Unable to create temporary lecturer profile',
          error: profileError.message,
          solution: 'Please contact an administrator to set up your lecturer profile'
        });
      }
    }

    // If still no lecturer profile, return error
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found. Please contact an administrator to set up your profile.'
      });
    }
    
    const { 
      title, 
      description, 
      courseId, 
      dueDate, 
      totalMarks, 
      instructions,
      isActive = true,
      visibleToStudents = true
    } = req.body;
    
    // Validate required fields
    if (!title || !courseId || !dueDate) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title, course, and due date'
      });
    }
    
    // Check if this lecturer teaches the course
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Check if course needs fixing
    if (!course.academicSession || typeof course.department === 'string' || 
        course.semester === 1 || course.semester === 2 || course.semester === '2') {
      console.log(`Fixing invalid course data for course ${courseId}`);
      
      // Find a valid department ID if needed
      let departmentId = course.department;
      if (typeof course.department === 'string') {
        // Allow keeping the string value as a fallback
        // Just verify it's not empty
        if (!course.department.trim()) {
          const department = await Department.findOne();
          if (department) {
            departmentId = department._id;
          } else {
            departmentId = "General Department"; // Default string value if no Department found
          }
        }
      }
      
      // Find a valid academic session if needed
      let academicSessionId = course.academicSession;
      if (!academicSessionId) {
        const AcademicSession = require('../models/AcademicSession');
        const academicSession = await AcademicSession.findOne();
        if (!academicSession) {
          return res.status(404).json({
            success: false,
            message: 'No academic sessions found in the system. Please contact an administrator.'
          });
        }
        academicSessionId = academicSession._id;
      }
      
      // Map numeric semester values to valid enum strings
      let semesterValue = course.semester;
      if (semesterValue === 1 || semesterValue === '1') {
        semesterValue = 'First';
      } else if (semesterValue === 2 || semesterValue === '2') {
        semesterValue = 'Second';
      } else if (!['First', 'Second', 'Third', 'Fourth'].includes(semesterValue)) {
        // Default to a valid value if current is not valid
        semesterValue = 'First';
      }
      
      try {
        // Create a brand new course as fallback
        const newCourse = await Course.create({
          code: course.code || `TEMP-${Date.now()}`,
          title: course.title || "Temporary Course",
          description: course.description || "Temporary course created to fix validation issues",
          department: departmentId,
          academicSession: academicSessionId,
          semester: semesterValue,
          lecturer: [lecturer._id]
        });
        
        console.log(`Created new valid course ${newCourse._id} to replace invalid course ${courseId}`);
        
        // Use the new course ID instead
        courseId = newCourse._id;
        course = newCourse;
      } catch (createError) {
        console.error('Failed to create replacement course:', createError);
        
        // Final fallback - continue with invalid course but use direct assignment creation
        console.log('Will attempt to create assignment with minimal validation');
      }
    }
    
    // If lecturer profile is temporary, automatically assign the course to them
    if (lecturer.isTemporary) {
      // Add lecturer to course
      if (!course.lecturer.includes(lecturer._id)) {
        course.lecturer.push(lecturer._id);
        await course.save();
      }
      
      // Add course to lecturer
      if (!lecturer.courses.includes(courseId)) {
        lecturer.courses.push(courseId);
        await lecturer.save();
      }
    } else {
      // Normal check if the lecturer is assigned to this course
      const lecturerIds = Array.isArray(course.lecturer) 
        ? course.lecturer.map(id => id.toString())
        : [];
        
      if (!lecturerIds.includes(lecturer._id.toString())) {
        // Auto-assign lecturer to this course
        course.lecturer.push(lecturer._id);
        await course.save();
        
        // Add course to lecturer's courses
        if (!lecturer.courses.includes(courseId)) {
          lecturer.courses.push(courseId);
          await lecturer.save();
        }
        
        console.log(`Auto-assigned lecturer ${lecturer._id} to course ${courseId} for testing`);
      }
    }
    
    // Process uploaded files
    const files = req.files || [];
    const fileDetails = files.map(file => ({
      filename: file.filename,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path
    }));
    
    // Get academic session from course if available
    let academicSessionId = course.academicSession;
    if (!academicSessionId) {
      // Try to find one
      const AcademicSession = require('../models/AcademicSession');
      const academicSession = await AcademicSession.findOne();
      if (academicSession) {
        academicSessionId = academicSession._id;
      }
    }

    // Create the assignment
    const assignment = await Assignment.create({
      title,
      description,
      course: courseId,
      dueDate: new Date(dueDate),
      totalMarks: totalMarks || 100,
      instructions,
      files: fileDetails,
      createdBy: req.user.id,
      isActive,
      visibleToStudents,
      lecturer: lecturer._id, // Add lecturer ID
      academicSession: academicSessionId // Add academic session if available
    });
    
    // Add this assignment to the course
    await Course.findByIdAndUpdate(
      courseId,
      { $push: { assignments: assignment._id } }
    );
    
    // Send notification to enrolled students
    if (visibleToStudents) {
      // Get all students enrolled in this course
      const enrolledStudents = await Student.find({ courses: courseId });
      
      // Create notifications
      const notifications = enrolledStudents.map(student => ({
        recipient: student.user,
        type: 'assignment',
        message: `New assignment "${title}" has been posted in ${course.code}`,
        referenceId: assignment._id,
        referenceModel: 'Assignment'
      }));
      
      // Only attempt to insert notifications if we have the model available
      if (notifications.length > 0 && global.models && global.models.Notification) {
        await global.models.Notification.insertMany(notifications);
      }
    }
    
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

/**
 * @desc    Update an assignment
 * @route   PUT /api/lecturer/assignments/:id
 * @access  Private/Lecturer
 */
exports.updateAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, 
      description, 
      dueDate, 
      totalMarks, 
      instructions,
      isActive,
      visibleToStudents,
      removeFiles = []
    } = req.body;
    
    // Find lecturer profile using the authenticated user's ID
    const lecturer = await Lecturer.findOne({ user: req.user.id });

    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found'
      });
    }
    
    // Find the assignment
    const assignment = await Assignment.findById(id);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }
    
    // Check if the lecturer created this assignment
    if (!assignment.createdBy || assignment.createdBy.toString() !== req.user.id) {
      // Alternative check: Allow if lecturer is assigned to this course
      const isTeachingCourse = lecturer && lecturer.courses && 
                               lecturer.courses.some(c => c.toString() === assignment.course.toString());
      
      if (!isTeachingCourse) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to update this assignment'
        });
      }
    }
    
    // Process uploaded files
    const files = req.files || [];
    const newFiles = files.map(file => ({
      filename: file.filename,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path
    }));
    
    // Filter out files that should be removed
    let existingFiles = assignment.files || [];
    if (removeFiles) {
      // Convert to array if it's a string
      const filesToRemove = Array.isArray(removeFiles) ? removeFiles : [removeFiles];
      existingFiles = existingFiles.filter(file => !filesToRemove.includes(file.filename));
    }
    
    // Update the assignment
    const updatedAssignment = await Assignment.findByIdAndUpdate(
      id,
      {
        title: title || assignment.title,
        description: description || assignment.description,
        dueDate: dueDate ? new Date(dueDate) : assignment.dueDate,
        totalMarks: totalMarks || assignment.totalMarks,
        instructions: instructions || assignment.instructions,
        files: [...existingFiles, ...newFiles],
        isActive: isActive !== undefined ? isActive : assignment.isActive,
        visibleToStudents: visibleToStudents !== undefined ? visibleToStudents : assignment.visibleToStudents,
        updatedAt: Date.now()
      },
      { new: true }
    );
    
    // If visibility changed to visible, notify students
    if (!assignment.visibleToStudents && updatedAssignment.visibleToStudents) {
      const course = await Course.findById(assignment.course);
      const enrolledStudents = await Student.find({ courses: assignment.course });
      
      const notifications = enrolledStudents.map(student => ({
        recipient: student.user,
        type: 'assignment',
        message: `Assignment "${updatedAssignment.title}" is now available in ${course ? course.code : 'your course'}`,
        referenceId: updatedAssignment._id,
        referenceModel: 'Assignment'
      }));
      
      if (notifications.length > 0) {
        await Notification.insertMany(notifications);
      }
    }
    
    // If due date changed, notify students
    if (dueDate && assignment.dueDate.toString() !== new Date(dueDate).toString()) {
      const course = await Course.findById(assignment.course);
      const enrolledStudents = await Student.find({ courses: assignment.course });
      
      const notifications = enrolledStudents.map(student => ({
        recipient: student.user,
        type: 'assignment_update',
        message: `Due date for "${updatedAssignment.title}" in ${course ? course.code : 'your course'} has been updated`,
        referenceId: updatedAssignment._id,
        referenceModel: 'Assignment'
      }));
      
      if (notifications.length > 0) {
        await Notification.insertMany(notifications);
      }
    }
    
    res.status(200).json({
      success: true,
      data: updatedAssignment
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

/**
 * @desc    Delete an assignment
 * @route   DELETE /api/lecturer/assignments/:id
 * @access  Private/Lecturer
 */
exports.deleteAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find lecturer profile using the authenticated user's ID
    const lecturer = await Lecturer.findOne({ user: req.user.id });

    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found'
      });
    }
    
    // Find the assignment
    const assignment = await Assignment.findById(id);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }
    
    // Check if the lecturer created this assignment
    if (assignment.createdBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this assignment'
      });
    }
    
    // Remove the assignment from the course
    await Course.findByIdAndUpdate(
      assignment.course,
      { $pull: { assignments: assignment._id } }
    );
    
    // Delete assignment submissions
    await AssignmentSubmission.deleteMany({ assignment: assignment._id });
    
    // Delete the assignment
    await Assignment.findByIdAndDelete(id);
    
    res.status(200).json({
      success: true,
      message: 'Assignment deleted successfully'
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
    
    // Find lecturer profile using the authenticated user's ID
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
    
    // Find lecturer profile using the authenticated user's ID
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

// @desc    Get all submissions for an assignment
// @route   GET /api/assignments/:id/submissions
// @access  Private/Lecturer
exports.getSubmissions = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find lecturer profile using the authenticated user's ID
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
    
    // Find lecturer profile using the authenticated user's ID
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