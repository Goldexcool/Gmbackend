const ExamTimetable = require('../models/ExamTimetable');
const Course = require('../models/Course');
const Lecturer = require('../models/Lecturer');
const Student = require('../models/Student');
const AcademicSession = require('../models/AcademicSession');
const mongoose = require('mongoose');

// Helper to get current/most recent academic session
async function getCurrentAcademicSession() {
  try {
    // Find most recent academic session
    const session = await AcademicSession.findOne({})
      .sort({ year: -1, createdAt: -1 })
      .limit(1);
    
    if (!session) {
      throw new Error('No academic sessions found');
    }
    
    return session._id;
  } catch (error) {
    console.error('Error getting current session:', error);
    throw error;
  }
}

// @desc    Create a new exam timetable
// @route   POST /api/admin/timetables
// @access  Private/Admin
exports.createExamTimetable = async (req, res) => {
  try {
    let {
      title,
      academicSession,
      semester,
      examType,
      startDate,
      endDate,
      sessions = []
    } = req.body;
    
    // Validate required fields
    if (!title || !semester || !examType || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }
    
    // If academicSession not provided, use current active session
    if (!academicSession) {
      const currentSession = await AcademicSession.getCurrent();
      if (!currentSession) {
        return res.status(400).json({
          success: false,
          message: 'No academic session found. Please create one or specify an academicSession ID.'
        });
      }
      academicSession = currentSession._id;
      console.log(`Using current academic session: ${currentSession.name} (${currentSession._id})`);
    } else {
      // Validate academicSession is a valid ObjectId
      if (!mongoose.Types.ObjectId.isValid(academicSession)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid academic session ID format'
        });
      }
      
      // Verify the academic session exists
      const sessionExists = await AcademicSession.findById(academicSession);
      if (!sessionExists) {
        return res.status(404).json({
          success: false,
          message: 'Academic session not found'
        });
      }
    }
    
    // Create timetable
    const timetable = new ExamTimetable({
      title,
      academicSession,
      semester,
      examType,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      sessions,
      createdBy: req.user.id
    });
    
    await timetable.save();
    
    res.status(201).json({
      success: true,
      data: timetable
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

// @desc    Get all exam timetables
// @route   GET /api/admin/timetables
// @access  Private/Admin
exports.getAllExamTimetables = async (req, res) => {
  try {
    const timetables = await ExamTimetable.find()
      .populate('academicSession', 'name year')
      .populate('createdBy', 'name')
      .sort('-createdAt');
    
    res.status(200).json({
      success: true,
      count: timetables.length,
      data: timetables
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

// @desc    Get a single exam timetable
// @route   GET /api/admin/timetables/:id
// @access  Private/Admin
exports.getExamTimetable = async (req, res) => {
  try {
    const timetable = await ExamTimetable.findById(req.params.id)
      .populate('academicSession', 'name year')
      .populate('createdBy', 'name')
      .populate({
        path: 'sessions.course',
        select: 'title code'
      })
      .populate({
        path: 'sessions.invigilators',
        select: 'user',
        populate: {
          path: 'user',
          select: 'name email'
        }
      });
    
    if (!timetable) {
      return res.status(404).json({
        success: false,
        message: 'Exam timetable not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: timetable
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

// @desc    Update an exam timetable
// @route   PUT /api/admin/timetables/:id
// @access  Private/Admin
exports.updateExamTimetable = async (req, res) => {
  try {
    const {
      title,
      academicSession,
      semester,
      examType,
      startDate,
      endDate,
      sessions,
      isPublished
    } = req.body;
    
    let timetable = await ExamTimetable.findById(req.params.id);
    
    if (!timetable) {
      return res.status(404).json({
        success: false,
        message: 'Exam timetable not found'
      });
    }
    
    // If timetable is already published and we're not specifically changing publish status
    if (timetable.isPublished && isPublished === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify a published timetable. Unpublish it first.'
      });
    }
    
    // Update fields
    const updateData = {
      title,
      academicSession,
      semester,
      examType,
      sessions,
      updatedBy: req.user.id
    };
    
    // Only update dates if provided
    if (startDate) updateData.startDate = new Date(startDate);
    if (endDate) updateData.endDate = new Date(endDate);
    
    // Handle publication status change
    if (isPublished !== undefined) {
      updateData.isPublished = isPublished;
      if (isPublished) {
        updateData.publishedAt = Date.now();
      }
    }
    
    // Update the timetable
    timetable = await ExamTimetable.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
    
    res.status(200).json({
      success: true,
      data: timetable
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

// @desc    Delete an exam timetable
// @route   DELETE /api/admin/timetables/:id
// @access  Private/Admin
exports.deleteExamTimetable = async (req, res) => {
  try {
    const timetable = await ExamTimetable.findById(req.params.id);
    
    if (!timetable) {
      return res.status(404).json({
        success: false,
        message: 'Exam timetable not found'
      });
    }
    
    // Only allow deletion of unpublished timetables
    if (timetable.isPublished) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete a published timetable. Unpublish it first.'
      });
    }
    
    await timetable.deleteOne();
    
    res.status(200).json({
      success: true,
      data: {}
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

// @desc    Add an exam session to a timetable
// @route   POST /api/admin/timetables/:id/sessions
// @access  Private/Admin
exports.addExamSession = async (req, res) => {
  try {
    const {
      course,
      date,
      startTime,
      endTime,
      venue,
      invigilators = [],
      notes
    } = req.body;
    
    if (!course || !date || !startTime || !endTime || !venue) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }
    
    const timetable = await ExamTimetable.findById(req.params.id);
    
    if (!timetable) {
      return res.status(404).json({
        success: false,
        message: 'Exam timetable not found'
      });
    }
    
    // Check if timetable is already published
    if (timetable.isPublished) {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify a published timetable. Unpublish it first.'
      });
    }
    
    // Verify course exists
    const courseExists = await Course.findById(course);
    if (!courseExists) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Add new session
    timetable.sessions.push({
      course,
      date: new Date(date),
      startTime,
      endTime,
      venue,
      invigilators,
      notes
    });
    
    timetable.updatedBy = req.user.id;
    await timetable.save();
    
    res.status(201).json({
      success: true,
      data: timetable
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

// @desc    Update an exam session
// @route   PUT /api/admin/timetables/:id/sessions/:sessionId
// @access  Private/Admin
exports.updateExamSession = async (req, res) => {
  try {
    const {
      course,
      date,
      startTime,
      endTime,
      venue,
      invigilators,
      notes
    } = req.body;
    
    const timetable = await ExamTimetable.findById(req.params.id);
    
    if (!timetable) {
      return res.status(404).json({
        success: false,
        message: 'Exam timetable not found'
      });
    }
    
    // Check if timetable is already published
    if (timetable.isPublished) {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify a published timetable. Unpublish it first.'
      });
    }
    
    // Find the session by ID
    const sessionIndex = timetable.sessions.findIndex(
      session => session._id.toString() === req.params.sessionId
    );
    
    if (sessionIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Exam session not found'
      });
    }
    
    // Update session fields
    if (course) timetable.sessions[sessionIndex].course = course;
    if (date) timetable.sessions[sessionIndex].date = new Date(date);
    if (startTime) timetable.sessions[sessionIndex].startTime = startTime;
    if (endTime) timetable.sessions[sessionIndex].endTime = endTime;
    if (venue) timetable.sessions[sessionIndex].venue = venue;
    if (invigilators) timetable.sessions[sessionIndex].invigilators = invigilators;
    if (notes !== undefined) timetable.sessions[sessionIndex].notes = notes;
    
    timetable.updatedBy = req.user.id;
    await timetable.save();
    
    res.status(200).json({
      success: true,
      data: timetable
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

// @desc    Remove an exam session
// @route   DELETE /api/admin/timetables/:id/sessions/:sessionId
// @access  Private/Admin
exports.removeExamSession = async (req, res) => {
  try {
    const timetable = await ExamTimetable.findById(req.params.id);
    
    if (!timetable) {
      return res.status(404).json({
        success: false,
        message: 'Exam timetable not found'
      });
    }
    
    // Check if timetable is already published
    if (timetable.isPublished) {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify a published timetable. Unpublish it first.'
      });
    }
    
    // Remove session
    timetable.sessions = timetable.sessions.filter(
      session => session._id.toString() !== req.params.sessionId
    );
    
    timetable.updatedBy = req.user.id;
    await timetable.save();
    
    res.status(200).json({
      success: true,
      data: timetable
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

// @desc    Publish/Unpublish a timetable
// @route   PUT /api/admin/timetables/:id/publish
// @access  Private/Admin
exports.togglePublishStatus = async (req, res) => {
  try {
    const { publish } = req.body;
    
    if (publish === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Please specify publish status'
      });
    }
    
    const timetable = await ExamTimetable.findById(req.params.id);
    
    if (!timetable) {
      return res.status(404).json({
        success: false,
        message: 'Exam timetable not found'
      });
    }
    
    timetable.isPublished = publish;
    if (publish) {
      timetable.publishedAt = Date.now();
    }
    
    timetable.updatedBy = req.user.id;
    await timetable.save();
    
    res.status(200).json({
      success: true,
      data: timetable
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

// ----------------- USER FACING ENDPOINTS -----------------

// @desc    Get published exam timetables
// @route   GET /api/timetables
// @access  Private (All authenticated users)
exports.getPublishedTimetables = async (req, res) => {
  try {
    // Only return published timetables
    const timetables = await ExamTimetable.find({ isPublished: true })
      .populate('academicSession', 'name year')
      .sort('-publishedAt');
    
    res.status(200).json({
      success: true,
      count: timetables.length,
      data: timetables
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

// @desc    Get a specific published timetable
// @route   GET /api/timetables/:id
// @access  Private (All authenticated users)
exports.getPublishedTimetable = async (req, res) => {
  try {
    const timetable = await ExamTimetable.findOne({
      _id: req.params.id,
      isPublished: true
    })
      .populate('academicSession', 'name year')
      .populate({
        path: 'sessions.course',
        select: 'title code'
      })
      .populate({
        path: 'sessions.invigilators',
        select: 'user',
        populate: {
          path: 'user',
          select: 'name email'
        }
      });
    
    if (!timetable) {
      return res.status(404).json({
        success: false,
        message: 'Exam timetable not found or not published'
      });
    }
    
    res.status(200).json({
      success: true,
      data: timetable
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

// @desc    Get exam timetable for a lecturer
// @route   GET /api/lecturers/timetables
// @access  Private (Lecturers only)
exports.getLecturerTimetable = async (req, res) => {
  try {
    // Get the lecturer profile
    const lecturer = await Lecturer.findOne({ user: req.user.id });
    
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer profile not found'
      });
    }
    
    // Find courses taught by this lecturer
    const courses = await Course.find({ 
      lecturer: lecturer._id 
    }).select('_id');
    
    const courseIds = courses.map(course => course._id);
    
    // Find all published timetables
    const timetables = await ExamTimetable.find({ 
      isPublished: true 
    }).populate('academicSession', 'name year');
    
    // Filter sessions to only include courses taught by this lecturer
    // or where lecturer is an invigilator
    const lecturerTimetables = timetables.map(timetable => {
      // Deep clone the timetable object
      const filteredTimetable = JSON.parse(JSON.stringify(timetable));
      
      // Filter sessions for this lecturer's courses
      filteredTimetable.sessions = timetable.sessions.filter(session => {
        // Include if course is taught by lecturer OR lecturer is an invigilator
        return (
          courseIds.some(id => id.toString() === session.course.toString()) || 
          session.invigilators.some(inv => inv.toString() === lecturer._id.toString())
        );
      });
      
      return filteredTimetable;
    }).filter(timetable => timetable.sessions.length > 0); // Only include timetables with matching sessions
    
    res.status(200).json({
      success: true,
      count: lecturerTimetables.length,
      data: lecturerTimetables
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
 * @desc    Get exam timetable for a specific student (admin view)
 * @route   GET /api/admin/students/:userId/timetables
 * @access  Private/Admin
 */
exports.getStudentTimetableByAdmin = async (req, res) => {
  try {
    const { userId } = req.params;
    const { academicSession } = req.query;
    
    // Find student by user ID
    const student = await Student.findOne({ user: userId })
      .populate('user', 'fullName email')
      .populate('department', 'name');
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }
    
    // Define query for exams
    const query = {};
    
    // If academic session is specified, include that filter
    if (academicSession) {
      query.academicSession = academicSession;
    }
    
    // Find all course enrollments for this student
    const enrollments = await Enrollment.find({
      student: student._id,
      status: 'approved'
    }).populate('course', 'code title');
    
    // Extract course IDs
    const courseIds = enrollments.map(enrollment => enrollment.course._id);
    
    // Find exam timetables that include these courses
    const examTimetables = await ExamTimetable.find(query)
      .populate('academicSession', 'name year')
      .populate('department', 'name')
      .populate({
        path: 'examSessions',
        match: { course: { $in: courseIds } },
        populate: [
          { path: 'course', select: 'code title credits' },
          { path: 'venue', select: 'name capacity location' }
        ]
      });
    
    // Filter out timetables with no relevant sessions
    const relevantTimetables = examTimetables.filter(timetable => 
      timetable.examSessions && timetable.examSessions.length > 0
    );
    
    // Format the response data
    const formattedTimetables = relevantTimetables.map(timetable => ({
      id: timetable._id,
      title: timetable.title,
      academicSession: timetable.academicSession,
      department: timetable.department,
      isPublished: timetable.isPublished,
      examSessions: timetable.examSessions.map(session => ({
        id: session._id,
        course: session.course,
        venue: session.venue,
        date: session.date,
        startTime: session.startTime,
        endTime: session.endTime,
        instructions: session.instructions
      }))
    }));
    
    res.status(200).json({
      success: true,
      data: {
        student: {
          id: student._id,
          name: student.user.fullName,
          email: student.user.email,
          matricNumber: student.matricNumber,
          department: student.department?.name || 'N/A'
        },
        timetables: formattedTimetables
      }
    });
  } catch (error) {
    console.error('Error getting student timetable:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting student timetable',
      error: error.message
    });
  }
};

// @desc    Get exam timetable for a student
// @route   GET /api/students/timetables
// @access  Private (Students only)
exports.getStudentTimetable = async (req, res) => {
  try {
    // Only admins can check timetables for other students
    const userId = req.user.role === 'admin' && req.query.userId 
      ? req.query.userId 
      : req.user.id;
    
    // Get the student profile
    const student = await Student.findOne({ user: userId })
      .populate('courses', '_id');
    
    // If no student profile, still return published timetables without filtering
    if (!student) {
      // For admins, we'll return all timetables
      if (req.user.role === 'admin') {
        const allTimetables = await ExamTimetable.find({ isPublished: true })
          .populate('academicSession', 'name year')
          .populate({
            path: 'sessions.course',
            select: 'title code'
          });
        
        return res.status(200).json({
          success: true,
          count: allTimetables.length,
          data: allTimetables,
          note: "Showing all timetables because student profile was not found"
        });
      } else {
        // For non-admin users without a student profile
        return res.status(404).json({
          success: false,
          message: 'Student profile not found. Please complete your profile to view your exam schedule.'
        });
      }
    }
    
    // Get course IDs enrolled by the student
    const courseIds = student.courses.map(course => course._id);
    
    // Find all published timetables
    const timetables = await ExamTimetable.find({ 
      isPublished: true 
    })
    .populate('academicSession', 'name year')
    .populate({
      path: 'sessions.course',
      select: 'title code'
    });
    
    // Filter sessions to only include courses the student is enrolled in
    const studentTimetables = timetables.map(timetable => {
      // Deep clone the timetable object
      const filteredTimetable = JSON.parse(JSON.stringify(timetable));
      
      // Filter sessions for this student's courses
      filteredTimetable.sessions = timetable.sessions.filter(session => {
        // If the course field is populated, check the _id directly
        const courseId = session.course._id || session.course;
        return courseIds.some(id => id.toString() === courseId.toString());
      });
      
      return filteredTimetable;
    }).filter(timetable => timetable.sessions.length > 0); // Only include timetables with matching sessions
    
    res.status(200).json({
      success: true,
      count: studentTimetables.length,
      data: studentTimetables
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

// @desc    Get exam timetable for a student by admin
// @route   GET /api/admin/students/:userId/timetables
// @access  Private/Admin
exports.getStudentTimetableByAdmin = async (req, res) => {
  try {
    const userId = req.params.userId;
    const User = require('../models/User'); // Import if needed
    
    // Verify user exists
    const userExists = await User.findById(userId);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Get student profile
    const student = await Student.findOne({ user: userId })
      .populate('courses', '_id title code');
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }
    
    // Get course IDs enrolled by the student
    const courseIds = student.courses.map(course => course._id);
    
    // Find all published timetables
    const timetables = await ExamTimetable.find({ 
      isPublished: true 
    })
    .populate('academicSession', 'name year')
    .populate({
      path: 'sessions.course',
      select: 'title code'
    });
    
    // Filter sessions to only include courses the student is enrolled in
    const studentTimetables = timetables.map(timetable => {
      // Deep clone the timetable object
      const filteredTimetable = JSON.parse(JSON.stringify(timetable));
      
      // Filter sessions for this student's courses
      filteredTimetable.sessions = timetable.sessions.filter(session => {
        const courseId = session.course._id || session.course;
        return courseIds.some(id => id.toString() === courseId.toString());
      });
      
      return filteredTimetable;
    }).filter(timetable => timetable.sessions.length > 0);
    
    res.status(200).json({
      success: true,
      count: studentTimetables.length,
      data: studentTimetables,
      studentInfo: {
        id: student._id,
        name: userExists.name,
        email: userExists.email,
        courses: student.courses
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