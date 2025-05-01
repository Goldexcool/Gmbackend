const AcademicSession = require('../models/AcademicSession');
const mongoose = require('mongoose');

// @desc    Create a new academic session
// @route   POST /api/admin/academic-sessions
// @access  Private/Admin
exports.createAcademicSession = async (req, res) => {
  try {
    const { name, year, startDate, endDate } = req.body;
    
    // Check if required fields are provided
    if (!name || !year || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: name, year, startDate, endDate'
      });
    }
    
    // Check if a session with the same year already exists
    const existingSession = await AcademicSession.findOne({ year });
    if (existingSession) {
      return res.status(400).json({
        success: false,
        message: `Academic session for year ${year} already exists`
      });
    }
    
    // Create new session
    const session = new AcademicSession({
      name,
      year,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      isActive: true
    });
    
    await session.save();
    
    res.status(201).json({
      success: true,
      data: session
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

// @desc    Get all academic sessions
// @route   GET /api/academic-sessions
// @access  Private
exports.getAllAcademicSessions = async (req, res) => {
  try {
    const sessions = await AcademicSession.find()
      .sort({ year: -1, createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: sessions.length,
      data: sessions
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

// @desc    Get current active academic session
// @route   GET /api/academic-sessions/current
// @access  Private
exports.getCurrentSession = async (req, res) => {
  try {
    const session = await AcademicSession.findOne({ isActive: true })
      .sort({ year: -1, createdAt: -1 });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'No active academic session found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: session
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

// @desc    Update an academic session
// @route   PUT /api/admin/academic-sessions/:id
// @access  Private/Admin
exports.updateAcademicSession = async (req, res) => {
  try {
    const { name, year, startDate, endDate, isActive } = req.body;
    
    // Find session by ID
    const session = await AcademicSession.findById(req.params.id);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Academic session not found'
      });
    }
    
    // If making this session active, deactivate all other sessions
    if (isActive === true && !session.isActive) {
      await AcademicSession.updateMany(
        { _id: { $ne: session._id } },
        { $set: { isActive: false } }
      );
    }
    
    // Update fields
    if (name) session.name = name;
    if (year) session.year = year;
    if (startDate) session.startDate = new Date(startDate);
    if (endDate) session.endDate = new Date(endDate);
    if (isActive !== undefined) session.isActive = isActive;
    
    await session.save();
    
    res.status(200).json({
      success: true,
      data: session
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

// @desc    Set an academic session as current/active
// @route   PUT /api/admin/academic-sessions/:id/activate
// @access  Private/Admin
exports.setActiveSession = async (req, res) => {
  try {
    const session = await AcademicSession.findById(req.params.id);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Academic session not found'
      });
    }
    
    // First deactivate all sessions
    await AcademicSession.updateMany({}, { $set: { isActive: false } });
    
    // Then set this one as active
    session.isActive = true;
    await session.save();
    
    res.status(200).json({
      success: true,
      message: `${session.name} is now set as the active academic session`,
      data: session
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

// @desc    Delete an academic session
// @route   DELETE /api/admin/academic-sessions/:id
// @access  Private/Admin
exports.deleteAcademicSession = async (req, res) => {
  try {
    const session = await AcademicSession.findById(req.params.id);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Academic session not found'
      });
    }
    
    // Check if this session has any associated timetables
    const ExamTimetable = require('../models/ExamTimetable');
    const hasTimetables = await ExamTimetable.exists({ academicSession: session._id });
    
    if (hasTimetables) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete this academic session as it has exam timetables associated with it'
      });
    }
    
    await session.deleteOne();
    
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

// @desc    Archive an academic session
// @route   PUT /api/admin/academic-sessions/:id/archive
// @access  Private/Admin
exports.archiveAcademicSession = async (req, res) => {
  try {
    const session = await AcademicSession.findById(req.params.id);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Academic session not found'
      });
    }
    
    // Mark as archived and inactive
    session.isArchived = true;
    session.isActive = false;
    
    await session.save();
    
    // Could also archive associated timetables here if needed
    
    res.status(200).json({
      success: true,
      message: `${session.name} has been archived`,
      data: session
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

// @desc    Prepare transition to new academic year
// @route   POST /api/admin/academic-sessions/transition
// @access  Private/Admin
exports.prepareSessionTransition = async (req, res) => {
  try {
    const { 
      sourceSessions, 
      newSessionName, 
      newSessionYear,
      newSessionStartDate,
      newSessionEndDate,
      copyCoursesFromFirstSemester = true,
      copyCoursesFromSecondSemester = true,
      updateCodes = false, // whether to update course codes with year suffix
      departmentsToInclude = [] // optional filter
    } = req.body;
    
    // Validate required fields
    if (!newSessionName || !newSessionYear || !newSessionStartDate || !newSessionEndDate) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields for the new academic session'
      });
    }
    
    // Check if session with this year already exists
    const existingSession = await AcademicSession.findOne({ year: newSessionYear });
    if (existingSession) {
      return res.status(400).json({
        success: false,
        message: `Academic session for year ${newSessionYear} already exists`
      });
    }
    
    // Create new session
    const newSession = new AcademicSession({
      name: newSessionName,
      year: newSessionYear,
      startDate: new Date(newSessionStartDate),
      endDate: new Date(newSessionEndDate),
      isActive: false // don't activate yet
    });
    
    await newSession.save();
    
    // Track the results of our operations
    const results = {
      session: {
        _id: newSession._id,
        name: newSession.name,
        year: newSession.year
      },
      courses: {
        firstSemester: { copied: 0, errors: [] },
        secondSemester: { copied: 0, errors: [] }
      }
    };
    
    // If we're copying courses from previous sessions
    if (copyCoursesFromFirstSemester && sourceSessions?.firstSemester) {
      try {
        // Copy first semester courses
        await copyCourses(
          sourceSessions.firstSemester,
          newSession._id,
          'First',
          departmentsToInclude,
          updateCodes,
          results.courses.firstSemester
        );
      } catch (err) {
        console.error('Error copying first semester courses:', err);
        results.courses.firstSemester.errors.push({
          message: 'Failed to copy first semester courses',
          error: err.message
        });
      }
    }
    
    if (copyCoursesFromSecondSemester && sourceSessions?.secondSemester) {
      try {
        // Copy second semester courses
        await copyCourses(
          sourceSessions.secondSemester,
          newSession._id,
          'Second',
          departmentsToInclude,
          updateCodes,
          results.courses.secondSemester
        );
      } catch (err) {
        console.error('Error copying second semester courses:', err);
        results.courses.secondSemester.errors.push({
          message: 'Failed to copy second semester courses',
          error: err.message
        });
      }
    }
    
    res.status(201).json({
      success: true,
      message: `New academic session created and ${results.courses.firstSemester.copied + results.courses.secondSemester.copied} courses copied`,
      data: results
    });
  } catch (error) {
    console.error('Error in session transition:', error);
    res.status(500).json({
      success: false,
      message: 'Error preparing session transition',
      error: error.message
    });
  }
};

// Helper function to copy courses between sessions
const copyCourses = async (sourceSessionId, targetSessionId, semester, departments, updateCodes, results) => {
  // Build query for source courses
  const query = { 
    academicSession: sourceSessionId,
    semester
  };
  
  // Filter by departments if provided
  if (departments && Array.isArray(departments) && departments.length > 0) {
    query.department = { $in: departments };
  }
  
  // Find source courses
  const sourceCourses = await Course.find(query).populate('lecturer');
  
  // Get the target session for code generation
  const targetSession = await AcademicSession.findById(targetSessionId);
  
  // Process each course
  for (const course of sourceCourses) {
    try {
      // Generate new code if needed
      const newCode = updateCodes 
        ? `${course.code}-${targetSession.year.split('/')[0]}` 
        : course.code;
      
      // Check if course already exists in target session
      const existingCourse = await Course.findOne({
        code: newCode,
        academicSession: targetSessionId,
        semester
      });
      
      if (existingCourse) {
        results.errors.push({
          code: course.code,
          message: 'Course already exists in target session'
        });
        continue;
      }
      
      // Create new course
      const newCourse = new Course({
        code: newCode,
        title: course.title,
        description: course.description,
        creditHours: course.creditHours,
        department: course.department,
        level: course.level,
        academicSession: targetSessionId,
        semester,
        lecturer: course.lecturer, // Copy lecturer assignments
        isActive: true
      });
      
      await newCourse.save();
      results.copied++;
    } catch (err) {
      results.errors.push({
        code: course.code,
        message: err.message
      });
    }
  }
  
  return results;
};