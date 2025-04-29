// controllers/adminController.js
const User = require('../models/User');
const Student = require('../models/Student');
const Lecturer = require('../models/Lecturer');
const Course = require('../models/Course');
const Schedule = require('../models/Schedule');
const Announcement = require('../models/Announcement');
const FAQ = require('../models/FAQ');
const Settings = require('../models/Settings');
const AcademicSession = require('../models/AcademicSession');
const Enrollment = require('../models/Enrollment');

// @desc    Set global schedule
// @route   POST /api/admin/schedule
// @access  Private (Admin only)
exports.setGlobalSchedule = async (req, res) => {
  try {
    const { semesterStart, semesterEnd, holidayDates } = req.body;
    
    if (!semesterStart || !semesterEnd) {
      return res.status(400).json({
        success: false,
        message: 'Please provide semester start and end dates'
      });
    }
    
    // Find existing settings or create new one
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings();
    }
    
    // Update schedule settings
    settings.academicCalendar = {
      semesterStart,
      semesterEnd,
      holidayDates: holidayDates || []
    };
    
    // Save settings
    await settings.save();
    
    res.status(200).json({
      success: true,
      message: 'Global schedule updated successfully',
      data: settings.academicCalendar
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get all schedules
// @route   GET /api/admin/schedules
// @access  Private (Admin only)
exports.getSchedules = async (req, res) => {
  try {
    const { courseId, lecturerId, date, startDate, endDate } = req.query;
    
    // Build query based on provided filters
    const query = {};
    
    if (courseId) {
      query.course = courseId;
    }
    
    if (lecturerId) {
      query.lecturer = lecturerId;
    }
    
    if (date) {
      query.date = new Date(date);
    } else if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    const schedules = await Schedule.find(query)
      .populate('course', 'name code')
      .populate({
        path: 'lecturer',
        select: 'user',
        populate: {
          path: 'user',
          select: 'fullName email'
        }
      })
      .sort({ date: 1 });
    
    res.status(200).json({
      success: true,
      count: schedules.length,
      data: schedules
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

// @desc    Create multiple schedules at once
// @route   POST /api/admin/schedules/bulk
// @access  Private (Admin only)
exports.createBulkSchedules = async (req, res) => {
  try {
    const { scheduleItems } = req.body;
    
    if (!scheduleItems || !Array.isArray(scheduleItems) || scheduleItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of schedule items'
      });
    }
    
    const results = {
      successful: [],
      failed: []
    };
    
    for (const item of scheduleItems) {
      try {
        const { courseId, lecturerId, date, time, venue, topic } = item;
        
        // Validate required fields
        if (!courseId || !date || !time || !venue) {
          results.failed.push({
            item,
            error: 'Missing required fields (courseId, date, time, venue)'
          });
          continue;
        }
        
        // Create schedule
        const schedule = await Schedule.create({
          course: courseId,
          lecturer: lecturerId,
          date: new Date(date),
          time,
          venue,
          topic,
          createdBy: req.user.id
        });
        
        results.successful.push({
          id: schedule._id,
          course: courseId,
          date,
          time,
          venue
        });
      } catch (err) {
        results.failed.push({
          item,
          error: err.message
        });
      }
    }
    
    res.status(201).json({
      success: true,
      message: `Created ${results.successful.length} schedules with ${results.failed.length} errors`,
      data: results
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

// @desc    Update a schedule
// @route   PUT /api/admin/schedules/:id
// @access  Private (Admin only)
exports.updateSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, time, venue, topic, lecturerId } = req.body;
    
    // Find schedule first to check if it exists
    const schedule = await Schedule.findById(id);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Schedule not found'
      });
    }
    
    // Update fields if provided
    if (date) schedule.date = new Date(date);
    if (time) schedule.time = time;
    if (venue) schedule.venue = venue;
    if (topic !== undefined) schedule.topic = topic;
    if (lecturerId) schedule.lecturer = lecturerId;
    
    // Save the updated schedule
    await schedule.save();
    
    res.status(200).json({
      success: true,
      message: 'Schedule updated successfully',
      data: schedule
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

// @desc    Delete a schedule
// @route   DELETE /api/admin/schedules/:id
// @access  Private (Admin only)
exports.deleteSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find and delete the schedule
    const schedule = await Schedule.findByIdAndDelete(id);
    
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Schedule not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Schedule deleted successfully',
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

// @desc    Delete all schedules for a course
// @route   DELETE /api/admin/schedules/course/:courseId
// @access  Private (Admin only)
exports.deleteCoursesSchedules = async (req, res) => {
  try {
    const { courseId } = req.params;
    
    // Delete all schedules for the course
    const result = await Schedule.deleteMany({ course: courseId });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'No schedules found for this course'
      });
    }
    
    res.status(200).json({
      success: true,
      message: `Deleted ${result.deletedCount} schedules for the course`,
      data: {
        courseId,
        deletedCount: result.deletedCount
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

// @desc    Get all FAQs
// @route   GET /api/admin/faqs
// @access  Private (Admin only)
exports.getAllFAQs = async (req, res) => {
  try {
    const faqs = await FAQ.find().sort({ category: 1, order: 1 });
    
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

// @desc    Get FAQ by ID
// @route   GET /api/admin/faqs/:faqId
// @access  Private (Admin only)
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
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Create a new FAQ
// @route   POST /api/admin/faqs
// @access  Private (Admin only)
exports.createFAQ = async (req, res) => {
  try {
    const { question, answer, category, order } = req.body;
    
    if (!question || !answer) {
      return res.status(400).json({
        success: false,
        message: 'Please provide question and answer'
      });
    }
    
    const faq = await FAQ.create({
      question,
      answer,
      category: category || 'general',
      order: order || 0,
      createdBy: req.user.id
    });
    
    res.status(201).json({
      success: true,
      message: 'FAQ created successfully',
      data: faq
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

// @desc    Update a FAQ
// @route   PUT /api/admin/faqs/:faqId
// @access  Private (Admin only)
exports.updateFAQ = async (req, res) => {
  try {
    const { faqId } = req.params;
    const { question, answer, category, order, isActive } = req.body;
    
    const faq = await FAQ.findById(faqId);
    
    if (!faq) {
      return res.status(404).json({
        success: false,
        message: 'FAQ not found'
      });
    }
    
    // Update fields if provided
    if (question !== undefined) faq.question = question;
    if (answer !== undefined) faq.answer = answer;
    if (category !== undefined) faq.category = category;
    if (order !== undefined) faq.order = parseInt(order);
    if (isActive !== undefined) faq.isActive = Boolean(isActive);
    
    faq.updatedAt = Date.now();
    faq.updatedBy = req.user.id;
    
    const updatedFaq = await faq.save();
    
    res.status(200).json({
      success: true,
      message: 'FAQ updated successfully',
      data: updatedFaq
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

// @desc    Delete a FAQ
// @route   DELETE /api/admin/faqs/:faqId
// @access  Private (Admin only)
exports.deleteFAQ = async (req, res) => {
  try {
    const { faqId } = req.params;
    
    const faq = await FAQ.findByIdAndDelete(faqId);
    
    if (!faq) {
      return res.status(404).json({
        success: false,
        message: 'FAQ not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'FAQ deleted successfully',
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

// @desc    Get admin dashboard data
// @route   GET /api/admin/dashboard
// @access  Private (Admin only)
exports.getAdminDashboard = async (req, res) => {
  try {
    // Get counts
    const userCount = await User.countDocuments();
    const studentCount = await Student.countDocuments();
    const lecturerCount = await Lecturer.countDocuments();
    const courseCount = await Course.countDocuments();
    const enrollmentCount = await Enrollment.countDocuments();
    const activeEnrollments = await Enrollment.countDocuments({ status: 'active' });
    
    // Get recent enrollments
    const recentEnrollments = await Enrollment.find()
      .sort('-createdAt')
      .limit(5)
      .populate('student', 'user')
      .populate({
        path: 'student',
        populate: {
          path: 'user',
          select: 'fullName email'
        }
      })
      .populate('course', 'name code');
    
    // Get recent users
    const recentUsers = await User.find()
      .sort('-createdAt')
      .limit(5)
      .select('fullName email role createdAt');
    
    // Get announcements
    const announcements = await Announcement.find()
      .sort('-createdAt')
      .limit(3);
    
    // Department stats
    const departmentStats = await Course.aggregate([
      { $group: { _id: '$department', courseCount: { $sum: 1 } } },
      { $sort: { courseCount: -1 } },
      { $limit: 5 }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        stats: {
          users: userCount,
          students: studentCount,
          lecturers: lecturerCount,
          courses: courseCount,
          enrollments: enrollmentCount,
          activeEnrollments
        },
        recentEnrollments,
        recentUsers,
        announcements,
        departmentStats
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

// @desc    Get enrollment statistics
// @route   GET /api/admin/reports/enrollments
// @access  Private (Admin only)
exports.getEnrollmentStats = async (req, res) => {
  try {
    const { semester, academicYear, department, program } = req.query;
    
    // Base query
    let matchQuery = {};
    
    // Apply filters if provided
    if (semester || academicYear) {
      const academicSessionQuery = {};
      if (semester) academicSessionQuery.semester = semester;
      if (academicYear) academicSessionQuery.academicYear = academicYear;
      
      const academicSessions = await AcademicSession.find(academicSessionQuery);
      const sessionIds = academicSessions.map(session => session._id);
      
      matchQuery.academicSession = { $in: sessionIds };
    }
    
    // Get enrollments with student and course data
    const enrollments = await Enrollment.find(matchQuery)
      .populate({
        path: 'student',
        select: 'program department',
        populate: {
          path: 'user',
          select: 'fullName email'
        }
      })
      .populate({
        path: 'course',
        select: 'name code department credits'
      });
    
    // Filter by department or program if specified
    let filteredEnrollments = enrollments;
    
    if (department) {
      filteredEnrollments = filteredEnrollments.filter(
        enrollment => enrollment.course.department === department
      );
    }
    
    if (program) {
      filteredEnrollments = filteredEnrollments.filter(
        enrollment => enrollment.student.program === program
      );
    }
    
    // Calculate statistics
    const stats = {
      total: filteredEnrollments.length,
      byStatus: {
        active: filteredEnrollments.filter(e => e.status === 'active').length,
        completed: filteredEnrollments.filter(e => e.status === 'completed').length,
        dropped: filteredEnrollments.filter(e => e.status === 'dropped').length
      },
      byDepartment: {},
      byProgram: {},
      byCourse: {}
    };
    
    // Group by department
    filteredEnrollments.forEach(enrollment => {
      const dept = enrollment.course.department;
      if (!stats.byDepartment[dept]) {
        stats.byDepartment[dept] = 0;
      }
      stats.byDepartment[dept]++;
    });
    
    // Group by program
    filteredEnrollments.forEach(enrollment => {
      const program = enrollment.student.program;
      if (!stats.byProgram[program]) {
        stats.byProgram[program] = 0;
      }
      stats.byProgram[program]++;
    });
    
    // Group by course
    filteredEnrollments.forEach(enrollment => {
      const courseCode = enrollment.course.code;
      if (!stats.byCourse[courseCode]) {
        stats.byCourse[courseCode] = {
          name: enrollment.course.name,
          count: 0
        };
      }
      stats.byCourse[courseCode].count++;
    });
    
    // Convert object maps to arrays for easier frontend consumption
    stats.departmentsArray = Object.entries(stats.byDepartment).map(([name, count]) => ({ name, count }));
    stats.programsArray = Object.entries(stats.byProgram).map(([name, count]) => ({ name, count }));
    stats.coursesArray = Object.entries(stats.byCourse).map(([code, data]) => ({ 
      code, 
      name: data.name, 
      count: data.count 
    }));
    
    res.status(200).json({
      success: true,
      data: stats
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

// @desc    Create a new course
// @route   POST /api/admin/courses
// @access  Private (Admin only)
exports.createCourse = async (req, res) => {
  try {
    const {
      name,
      title,
      code,
      description,
      credits,
      department,
      college,
      level,
      semester,
      prerequisites,
      capacity
    } = req.body;

    // Check if required fields are provided
    if (!name || !code || !department) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, code, and department'
      });
    }

    // Check if course with same code already exists
    const existingCourse = await Course.findOne({ code });
    if (existingCourse) {
      return res.status(400).json({
        success: false,
        message: `Course with code ${code} already exists`
      });
    }

    // Create course
    const course = await Course.create({
      name,
      title: title || name,
      code,
      description: description || '',
      credits: credits || 3,
      department,
      college: college || department,
      level: level || 'undergraduate',
      semester: semester || 'any',
      prerequisites: prerequisites || [],
      capacity: capacity || 50,
      enrolledStudents: [],
      assignedLecturers: [],
      createdBy: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Course created successfully',
      data: course
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

// @desc    Create multiple courses at once
// @route   POST /api/admin/courses/bulk
// @access  Private (Admin only)
exports.createCoursesBulk = async (req, res) => {
  try {
    const { courses } = req.body;
    
    if (!courses || !Array.isArray(courses) || courses.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of course data'
      });
    }
    
    const createdCourses = [];
    const errors = [];
    
    // Check for duplicate course codes within the array
    const courseCodesInArray = courses.map(course => course.code);
    const duplicateCodesInArray = courseCodesInArray.filter((code, index) => 
      courseCodesInArray.indexOf(code) !== index
    );
    
    if (duplicateCodesInArray.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate course codes found in the input array',
        data: {
          duplicates: [...new Set(duplicateCodesInArray)]
        }
      });
    }
    
    // Check for existing codes in database
    const existingCodes = await Course.find({
      code: { $in: courseCodesInArray }
    }).select('code');
    
    const existingCodesArray = existingCodes.map(course => course.code);
    
    for (const courseData of courses) {
      try {
        const {
          name,
          title,
          code,
          description,
          credits,
          department,
          college,
          level,
          semester,
          prerequisites,
          capacity
        } = courseData;
        
        // Validate required fields
        if (!name || !code || !department) {
          errors.push({
            code: code || 'unknown',
            error: 'Missing required fields (name, code, department)'
          });
          continue;
        }
        
        // Check if course code exists in database
        if (existingCodesArray.includes(code)) {
          errors.push({
            code,
            error: `Course with code ${code} already exists`
          });
          continue;
        }
        
        // Create course
        const course = await Course.create({
          name,
          title: title || name,
          code,
          description: description || '',
          credits: credits || 3,
          department,
          college: college || department,
          level: level || 'undergraduate',
          semester: semester || 'any',
          prerequisites: prerequisites || [],
          capacity: capacity || 50,
          enrolledStudents: [],
          assignedLecturers: [],
          createdBy: req.user.id
        });
        
        createdCourses.push({
          id: course._id,
          name: course.name,
          code: course.code,
          department: course.department
        });
        
      } catch (err) {
        errors.push({
          code: courseData.code || 'unknown',
          error: err.message
        });
      }
    }
    
    res.status(201).json({
      success: true,
      message: `Created ${createdCourses.length} courses with ${errors.length} errors`,
      data: {
        courses: createdCourses,
        errors
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

// @desc    Get courses by department name
// @route   GET /api/admin/courses/department/:departmentName
// @access  Private (Admin only)
exports.getCoursesByDepartment = async (req, res) => {
  try {
    const { departmentName } = req.params;
    const { searchTerm, page = 1, limit = 20, sortBy = 'code', sortOrder = 1 } = req.query;
    
    // Build query
    const query = { department: departmentName };
    
    // Add search functionality if provided
    if (searchTerm) {
      query.$or = [
        { name: { $regex: searchTerm, $options: 'i' } },
        { code: { $regex: searchTerm, $options: 'i' } },
        { description: { $regex: searchTerm, $options: 'i' } }
      ];
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Prepare sort object
    const sort = {};
    sort[sortBy] = parseInt(sortOrder);
    
    // Get courses
    const courses = await Course.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate({
        path: 'assignedLecturers',
        select: 'user',
        populate: {
          path: 'user',
          select: 'fullName email'
        }
      });
    
    // Get total count for pagination
    const totalCourses = await Course.countDocuments(query);
    
    // Calculate enrollment statistics for each course
    const coursesWithStats = await Promise.all(courses.map(async (course) => {
      const courseObj = course.toObject();
      
      // Get enrollment count
      const enrollmentCount = await Enrollment.countDocuments({ 
        course: course._id 
      });
      
      // Add stats to course object
      courseObj.stats = {
        enrollments: enrollmentCount,
        availableSeats: course.capacity - enrollmentCount,
        lecturerCount: course.assignedLecturers ? course.assignedLecturers.length : 0
      };
      
      return courseObj;
    }));
    
    res.status(200).json({
      success: true,
      count: coursesWithStats.length,
      totalPages: Math.ceil(totalCourses / parseInt(limit)),
      currentPage: parseInt(page),
      data: {
        department: departmentName,
        courses: coursesWithStats
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

// @desc    Update a course
// @route   PUT /api/admin/courses/:id
// @access  Private (Admin only)
exports.updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      title,
      code,
      description,
      credits,
      department,
      college,
      level,
      semester,
      prerequisites,
      capacity,
      isActive
    } = req.body;

    const course = await Course.findById(id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // If code is being updated, check that it doesn't conflict with an existing course
    if (code && code !== course.code) {
      const existingCourse = await Course.findOne({ code });
      if (existingCourse) {
        return res.status(400).json({
          success: false,
          message: `Course with code ${code} already exists`
        });
      }
      course.code = code;
    }

    // Update fields if provided
    if (name) course.name = name;
    if (title) course.title = title;
    if (description !== undefined) course.description = description;
    if (credits) course.credits = credits;
    if (department) course.department = department;
    if (college) course.college = college;
    if (level) course.level = level;
    if (semester) course.semester = semester;
    if (prerequisites) course.prerequisites = prerequisites;
    if (capacity) course.capacity = capacity;
    if (isActive !== undefined) course.isActive = isActive;

    course.updatedAt = Date.now();
    course.updatedBy = req.user.id;

    const updatedCourse = await course.save();

    res.status(200).json({
      success: true,
      message: 'Course updated successfully',
      data: updatedCourse
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

// @desc    Delete a course
// @route   DELETE /api/admin/courses/:id
// @access  Private (Admin only)
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

    // Check if there are active enrollments
    const enrollments = await Enrollment.find({ course: id, status: 'active' });
    if (enrollments.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete course with ${enrollments.length} active enrollments`,
        data: {
          enrollmentCount: enrollments.length
        }
      });
    }

    // Delete schedules related to this course
    await Schedule.deleteMany({ course: id });
    
    // Delete the course
    await Course.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Course deleted successfully'
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

// @desc    Batch update multiple courses
// @route   PATCH /api/admin/courses/batch
// @access  Private (Admin only)
exports.batchUpdateCourses = async (req, res) => {
  try {
    const { updates } = req.body;
    
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of course updates'
      });
    }
    
    const results = [];
    const errors = [];
    
    for (const update of updates) {
      try {
        const { id, ...updateData } = update;
        
        if (!id) {
          errors.push({
            error: 'Missing course ID',
            data: update
          });
          continue;
        }
        
        const course = await Course.findById(id);
        if (!course) {
          errors.push({
            id,
            error: 'Course not found'
          });
          continue;
        }
        
        // Check for code conflicts if code is being updated
        if (updateData.code && updateData.code !== course.code) {
          const existingCourse = await Course.findOne({ code: updateData.code });
          if (existingCourse) {
            errors.push({
              id,
              code: updateData.code,
              error: `Course with code ${updateData.code} already exists`
            });
            continue;
          }
        }
        
        // Update course
        Object.keys(updateData).forEach(key => {
          if (updateData[key] !== undefined) {
            course[key] = updateData[key];
          }
        });
        
        course.updatedAt = Date.now();
        course.updatedBy = req.user.id;
        
        const updatedCourse = await course.save();
        
        results.push({
          id: updatedCourse._id,
          code: updatedCourse.code,
          name: updatedCourse.name
        });
      } catch (err) {
        errors.push({
          id: update.id,
          error: err.message
        });
      }
    }
    
    res.status(200).json({
      success: true,
      message: `Updated ${results.length} courses with ${errors.length} errors`,
      data: {
        updated: results,
        errors
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

// @desc    Get lecturers by department
// @route   GET /api/admin/lecturers/department/:departmentName
// @access  Private (Admin only)
exports.getLecturersByDepartment = async (req, res) => {
  try {
    const { departmentName } = req.params;
    
    const lecturers = await Lecturer.find({ department: departmentName })
      .populate('user', 'fullName email isActive')
      .populate('courses', 'name code credits');
    
    // Get additional data for each lecturer
    const lecturersWithDetails = await Promise.all(lecturers.map(async (lecturer) => {
      const lecturerObj = lecturer.toObject();
      
      // Get assigned courses count
      const courseCount = lecturer.courses ? lecturer.courses.length : 0;
      
      // Get schedules for this lecturer
      const schedules = await Schedule.find({ lecturer: lecturer._id })
        .populate('course', 'name code')
        .sort({ date: 1 });
      
      // Calculate total teaching hours
      const totalHours = schedules.reduce((sum, schedule) => {
        const duration = (schedule.endTime - schedule.startTime) / (1000 * 60 * 60); // in hours
        return sum + duration;
      }, 0);
      
      lecturerObj.stats = {
        courseCount,
        scheduledHoursPerWeek: totalHours,
        scheduleCount: schedules.length
      };
      
      return lecturerObj;
    }));
    
    res.status(200).json({
      success: true,
      count: lecturersWithDetails.length,
      data: lecturersWithDetails
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

// @desc    Assign a course to a lecturer
// @route   POST /api/admin/assign-course
// @access  Private (Admin only)
exports.assignCourse = async (req, res) => {
  try {
    const { lecturerId, courseId } = req.body;
    
    if (!lecturerId || !courseId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide lecturerId and courseId'
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
    
    // Check if course is already assigned to this lecturer
    if (lecturer.courses && lecturer.courses.includes(courseId)) {
      return res.status(400).json({
        success: false,
        message: 'Course is already assigned to this lecturer'
      });
    }
    
    // Assign course to lecturer
    if (!lecturer.courses) {
      lecturer.courses = [];
    }
    lecturer.courses.push(courseId);
    await lecturer.save();
    
    // Add lecturer to course's assignedLecturers
    if (!course.assignedLecturers) {
      course.assignedLecturers = [];
    }
    course.assignedLecturers.push(lecturerId);
    await course.save();
    
    res.status(200).json({
      success: true,
      message: 'Course assigned to lecturer successfully',
      data: {
        lecturer: {
          id: lecturer._id,
          name: lecturer.user.fullName,
          coursesCount: lecturer.courses.length
        },
        course: {
          id: course._id,
          code: course.code,
          name: course.name
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

// @desc    Assign multiple courses to a lecturer
// @route   POST /api/admin/assign-courses
// @access  Private (Admin only)
exports.assignMultipleCourses = async (req, res) => {
  try {
    const { lecturerId, courseIds } = req.body;
    
    if (!lecturerId || !courseIds || !Array.isArray(courseIds) || courseIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide lecturerId and an array of courseIds'
      });
    }
    
    // Check if lecturer exists
    const lecturer = await Lecturer.findById(lecturerId)
      .populate('user', 'fullName email');
    
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer not found'
      });
    }
    
    // Initialize courses array if it doesn't exist
    if (!lecturer.courses) {
      lecturer.courses = [];
    }
    
    const assignedCourses = [];
    const errors = [];
    
    for (const courseId of courseIds) {
      try {
        // Check if course exists
        const course = await Course.findById(courseId);
        if (!course) {
          errors.push({
            courseId,
            error: 'Course not found'
          });
          continue;
        }
        
        // Check if course is already assigned to this lecturer
        if (lecturer.courses.includes(courseId)) {
          errors.push({
            courseId,
            code: course.code,
            error: 'Course is already assigned to this lecturer'
          });
          continue;
        }
        
        // Assign course to lecturer
        lecturer.courses.push(courseId);
        
        // Add lecturer to course's assignedLecturers
        if (!course.assignedLecturers) {
          course.assignedLecturers = [];
        }
        
        if (!course.assignedLecturers.includes(lecturerId)) {
          course.assignedLecturers.push(lecturerId);
          await course.save();
        }
        
        assignedCourses.push({
          id: course._id,
          code: course.code,
          name: course.name
        });
      } catch (err) {
        errors.push({
          courseId,
          error: err.message
        });
      }
    }
    
    // Save lecturer with updated courses
    await lecturer.save();
    
    res.status(200).json({
      success: true,
      message: `Assigned ${assignedCourses.length} courses to lecturer with ${errors.length} errors`,
      data: {
        lecturer: {
          id: lecturer._id,
          name: lecturer.user.fullName,
          email: lecturer.user.email,
          coursesCount: lecturer.courses.length
        },
        assignedCourses,
        errors
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

// @desc    Remove lecturer from a course
// @route   DELETE /api/admin/courses/:courseId/lecturers/:lecturerId
// @access  Private (Admin only)
exports.removeLecturerFromCourse = async (req, res) => {
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
    
    // Check if lecturer is assigned to the course
    if (!course.assignedLecturers || !course.assignedLecturers.includes(lecturerId)) {
      return res.status(400).json({
        success: false,
        message: 'Lecturer is not assigned to this course'
      });
    }
    
    // Remove lecturer from course
    course.assignedLecturers = course.assignedLecturers.filter(
      id => id.toString() !== lecturerId.toString()
    );
    await course.save();
    
    // Remove course from lecturer
    if (lecturer.courses) {
      lecturer.courses = lecturer.courses.filter(
        id => id.toString() !== courseId.toString()
      );
      await lecturer.save();
    }
    
    // Remove any schedules for this lecturer and course
    await Schedule.deleteMany({
      lecturer: lecturerId,
      course: courseId
    });
    
    res.status(200).json({
      success: true,
      message: 'Lecturer removed from course successfully',
      data: {
        course: {
          id: course._id,
          code: course.code,
          name: course.name,
          remainingLecturers: course.assignedLecturers.length
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

// @desc    Update course lecturers
// @route   PUT /api/admin/courses/:courseId/lecturers
// @access  Private (Admin only)
exports.updateCourseLecturers = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { lecturerIds } = req.body;
    
    if (!Array.isArray(lecturerIds)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of lecturerIds'
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
    
    // Get current lecturers
    const currentLecturerIds = course.assignedLecturers || [];
    
    // Lecturers to be added
    const lecturersToAdd = lecturerIds.filter(
      id => !currentLecturerIds.includes(id.toString())
    );
    
    // Lecturers to be removed
    const lecturersToRemove = currentLecturerIds.filter(
      id => !lecturerIds.includes(id.toString())
    );
    
    // Add new lecturers
    for (const lecturerId of lecturersToAdd) {
      const lecturer = await Lecturer.findById(lecturerId);
      if (lecturer) {
        if (!lecturer.courses) {
          lecturer.courses = [];
        }
        if (!lecturer.courses.includes(courseId)) {
          lecturer.courses.push(courseId);
          await lecturer.save();
        }
      }
    }
    
    // Remove lecturers that are not in the new list
    for (const lecturerId of lecturersToRemove) {
      const lecturer = await Lecturer.findById(lecturerId);
      if (lecturer && lecturer.courses) {
        lecturer.courses = lecturer.courses.filter(
          id => id.toString() !== courseId.toString()
        );
        await lecturer.save();
      }
      
      // Remove any schedules for this lecturer and course
      await Schedule.deleteMany({
        lecturer: lecturerId,
        course: courseId
      });
    }
    
    // Update course with new lecturer list
    course.assignedLecturers = lecturerIds;
    await course.save();
    
    // Get lecturer details for response
    const assignedLecturers = await Lecturer.find({
      _id: { $in: lecturerIds }
    }).populate('user', 'fullName email');
    
    res.status(200).json({
      success: true,
      message: 'Course lecturers updated successfully',
      data: {
        course: {
          id: course._id,
          code: course.code,
          name: course.name
        },
        lecturers: assignedLecturers.map(lecturer => ({
          id: lecturer._id,
          name: lecturer.user.fullName,
          email: lecturer.user.email,
          department: lecturer.department
        })),
        added: lecturersToAdd.length,
        removed: lecturersToRemove.length
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

// @desc    Set up a new department with courses
// @route   POST /api/admin/department-setup
// @access  Private (Admin only)
exports.setupDepartment = async (req, res) => {
  try {
    const { 
      departmentName, 
      college,
      courses 
    } = req.body;
    
    if (!departmentName) {
      return res.status(400).json({
        success: false,
        message: 'Department name is required'
      });
    }
    
    // Check if courses are provided
    if (!courses || !Array.isArray(courses) || courses.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of courses'
      });
    }
    
    // Check for duplicate course codes
    const courseCodesInArray = courses.map(course => course.code);
    const duplicateCodesInArray = courseCodesInArray.filter(
      (code, index) => courseCodesInArray.indexOf(code) !== index
    );
    
    if (duplicateCodesInArray.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate course codes found',
        data: {
          duplicates: [...new Set(duplicateCodesInArray)]
        }
      });
    }
    
    // Check if any course codes already exist in database
    const existingCodes = await Course.find({
      code: { $in: courseCodesInArray }
    }).select('code');
    
    if (existingCodes.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Some course codes already exist',
        data: {
          existingCodes: existingCodes.map(course => course.code)
        }
      });
    }
    
    // Create courses
    const createdCourses = [];
    for (const courseData of courses) {
      const course = await Course.create({
        ...courseData,
        department: departmentName,
        college: college || departmentName,
        createdBy: req.user.id
      });
      
      createdCourses.push({
        id: course._id,
        name: course.name,
        code: course.code
      });
    }
    
    res.status(201).json({
      success: true,
      message: `Department setup complete with ${createdCourses.length} courses`,
      data: {
        department: departmentName,
        college: college || departmentName,
        courses: createdCourses
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

// @desc    Update department details
// @route   PUT /api/admin/departments/:departmentName
// @access  Private (Admin only)
exports.updateDepartment = async (req, res) => {
  try {
    const { departmentName } = req.params;
    const { newDepartmentName, college } = req.body;
    
    // Find all courses in the department
    const courses = await Course.find({ department: departmentName });
    
    if (courses.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Department '${departmentName}' not found or has no courses`
      });
    }
    
    // Find all lecturers in the department
    const lecturers = await Lecturer.find({ department: departmentName });
    
    // Update department name in courses if provided
    if (newDepartmentName && newDepartmentName !== departmentName) {
      await Course.updateMany(
        { department: departmentName },
        { 
          department: newDepartmentName,
          updatedAt: Date.now(),
          updatedBy: req.user.id
        }
      );
      
      // Also update college if not explicitly provided
      if (!college) {
        await Course.updateMany(
          { department: newDepartmentName, college: departmentName },
          { 
            college: newDepartmentName,
            updatedAt: Date.now(),
            updatedBy: req.user.id
          }
        );
      }
      
      // Update lecturers department
      await Lecturer.updateMany(
        { department: departmentName },
        { 
          department: newDepartmentName,
          updatedAt: Date.now()
        }
      );
    }
    
    // Update college if provided
    if (college) {
      await Course.updateMany(
        { department: newDepartmentName || departmentName },
        { 
          college: college,
          updatedAt: Date.now(),
          updatedBy: req.user.id
        }
      );
    }
    
    res.status(200).json({
      success: true,
      message: 'Department updated successfully',
      data: {
        oldName: departmentName,
        name: newDepartmentName || departmentName,
        college: college,
        courseCount: courses.length,
        lecturerCount: lecturers.length
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

// @desc    Delete department and all its courses
// @route   DELETE /api/admin/departments/:departmentName
// @access  Private (Admin only)
exports.deleteDepartment = async (req, res) => {
  try {
    const { departmentName } = req.params;
    
    // Find all courses in the department
    const courses = await Course.find({ department: departmentName });
    
    if (courses.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Department '${departmentName}' not found or has no courses`
      });
    }
    
    // Check for active enrollments in any course
    const courseIds = courses.map(course => course._id);
    const activeEnrollments = await Enrollment.find({
      course: { $in: courseIds },
      status: 'active'
    });
    
    if (activeEnrollments.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete department with ${activeEnrollments.length} active enrollments`,
        data: {
          enrollmentCount: activeEnrollments.length
        }
      });
    }
    
    // Delete all schedules for courses in this department
    await Schedule.deleteMany({ course: { $in: courseIds } });
    
    // Remove courses from lecturers
    const lecturers = await Lecturer.find({ courses: { $in: courseIds } });
    for (const lecturer of lecturers) {
      lecturer.courses = lecturer.courses.filter(
        courseId => !courseIds.includes(courseId.toString())
      );
      await lecturer.save();
    }
    
    // Delete all courses in the department
    await Course.deleteMany({ department: departmentName });
    
    res.status(200).json({
      success: true,
      message: `Department '${departmentName}' and ${courses.length} courses deleted successfully`
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

// @desc    Get all departments
// @route   GET /api/admin/departments
// @access  Private (Admin only)
exports.getDepartments = async (req, res) => {
  try {
    // Get unique departments from courses
    const departments = await Course.aggregate([
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

// @desc    Get department details with courses and metrics
// @route   GET /api/admin/departments/:departmentName
// @access  Private (Admin only)
exports.getDepartmentDetails = async (req, res) => {
  try {
    const { departmentName } = req.params;
    
    // Get courses for the department
    const courses = await Course.find({ 
      department: departmentName
    }).populate('assignedLecturers');
    
    if (courses.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Department '${departmentName}' not found or has no courses`
      });
    }
    
    // Get lecturers for the department
    const lecturers = await Lecturer.find({ department: departmentName })
      .populate('user', 'fullName email isActive');
    
    // Get enrollments for courses in this department
    const courseIds = courses.map(course => course._id);
    const enrollments = await Enrollment.find({ 
      course: { $in: courseIds } 
    });
    
    res.status(200).json({
      success: true,
      data: {
        name: departmentName,
        courses,
        lecturers: lecturers.map(l => ({
          id: l._id,
          name: l.user.fullName,
          email: l.user.email,
          staffId: l.staffId,
          isActive: l.user.isActive
        })),
        stats: {
          courseCount: courses.length,
          lecturerCount: lecturers.length,
          enrollmentCount: enrollments.length,
          activeStudents: new Set(enrollments.map(e => e.student.toString())).size
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

// @desc    Create a user
// @route   POST /api/admin/users
// @access  Private (Admin only)
exports.createUser = async (req, res) => {
  try {
    const { 
      fullName, 
      email, 
      password, 
      role, 
      department, 
      staffId, 
      matricNumber,
      program,
      college
    } = req.body;
    
    // Validate required fields
    if (!fullName || !email || !role) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, and role'
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
    
    // Create user
    const user = await User.create({
      fullName,
      email,
      password: password || 'Password123!', // Default password
      role,
      isEmailVerified: true, // Admin created accounts are pre-verified
      passwordChangeRequired: true, // Force password change on first login
      createdBy: req.user.id
    });
    
    // Create role-specific profile
    if (role === 'lecturer') {
      if (!department) {
        await User.findByIdAndDelete(user._id);
        return res.status(400).json({
          success: false,
          message: 'Department is required for lecturer'
        });
      }
      
      await Lecturer.create({
        user: user._id,
        department,
        staffId: staffId || `STAFF${Math.floor(100000 + Math.random() * 900000)}`,
        college: college || department
      });
    } else if (role === 'student') {
      await Student.create({
        user: user._id,
        matricNumber: matricNumber || `MAT${Math.floor(100000 + Math.random() * 900000)}`,
        program: program || 'General Studies',
        department: department || 'Unassigned'
      });
    }
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role
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

// @desc    Create users in bulk with default passwords
// @route   POST /api/admin/users/bulk
// @access  Private (Admin only)
exports.createUsersBulk = async (req, res) => {
  try {
    const { users, defaultPassword = "Password123!" } = req.body;
    
    if (!users || !Array.isArray(users) || users.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of user data'
      });
    }
    
    const createdUsers = [];
    const errors = [];
    
    for (const userData of users) {
      try {
        const { fullName, email, role, department, staffId, matricNumber, program, college } = userData;
        
        // Validate required fields
        if (!fullName || !email || !role) {
          errors.push({
            email: email || 'unknown',
            error: 'Missing required fields (fullName, email, role)'
          });
          continue;
        }
        
        // Verify role is valid
        if (!['student', 'lecturer', 'admin'].includes(role)) {
          errors.push({
            email,
            error: 'Invalid role. Must be student, lecturer, or admin'
          });
          continue;
        }
        
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          errors.push({
            email,
            error: 'User with this email already exists'
          });
          continue;
        }
        
        // Create user with default password
        const user = await User.create({
          fullName,
          email,
          password: userData.password || defaultPassword,
          role,
          isEmailVerified: true, // Admin created accounts are pre-verified
          passwordChangeRequired: true, // Force password change on first login
          createdBy: req.user.id
        });
        
        // Create role-specific profile
        if (role === 'lecturer') {
          if (!department) {
            errors.push({
              email,
              error: 'Department is required for lecturers'
            });
            await User.findByIdAndDelete(user._id); // Clean up the created user
            continue;
          }
          
          await Lecturer.create({
            user: user._id,
            department,
            staffId: staffId || `STAFF${Math.floor(100000 + Math.random() * 900000)}`,
            college: college || department
          });
        } else if (role === 'student') {
          await Student.create({
            user: user._id,
            matricNumber: matricNumber || `MAT${Math.floor(100000 + Math.random() * 900000)}`,
            program: program || 'General Studies',
            department: department || 'Unassigned'
          });
        }
        
        // Add to created users
        createdUsers.push({
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          passwordChangeRequired: user.passwordChangeRequired
        });
        
      } catch (err) {
        errors.push({
          email: userData.email || 'unknown',
          error: err.message
        });
      }
    }
    
    res.status(201).json({
      success: true,
      message: `Created ${createdUsers.length} users with ${errors.length} errors`,
      data: {
        users: createdUsers,
        errors
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

// @desc    Toggle user active status
// @route   PATCH /api/admin/users/:userId/status
// @access  Private (Admin only)
exports.toggleUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;
    
    if (isActive === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Please provide isActive status'
      });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    user.isActive = isActive;
    await user.save();
    
    res.status(200).json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isActive: user.isActive
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

// @desc    Change user role
// @route   PATCH /api/admin/users/:userId/role
// @access  Private (Admin only)
exports.changeUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role, department, staffId, matricNumber, program } = req.body;
    
    if (!role || !['admin', 'lecturer', 'student'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid role (admin, lecturer, or student)'
      });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const oldRole = user.role;
    user.role = role;
    await user.save();
    
    // Handle role-specific data
    if (oldRole !== role) {
      // Clean up old role data
      if (oldRole === 'student') {
        await Student.findOneAndDelete({ user: userId });
      } else if (oldRole === 'lecturer') {
        await Lecturer.findOneAndDelete({ user: userId });
      }
      
      // Create new role data
      if (role === 'student') {
        if (!matricNumber) {
          return res.status(400).json({
            success: false,
            message: 'Matric number is required when changing to student role'
          });
        }
        
        await Student.create({
          user: userId,
          matricNumber,
          program: program || 'General Studies',
          department: department || 'Unassigned'
        });
      } else if (role === 'lecturer') {
        if (!department) {
          return res.status(400).json({
            success: false,
            message: 'Department is required when changing to lecturer role'
          });
        }
        
        await Lecturer.create({
          user: userId,
          department,
          staffId: staffId || `STAFF${Math.floor(100000 + Math.random() * 900000)}`,
          college: department
        });
      }
    }
    
    res.status(200).json({
      success: true,
      message: `User role changed from ${oldRole} to ${role} successfully`,
      data: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role
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

// @desc    Reset user password
// @route   POST /api/admin/users/:userId/reset-password
// @access  Private (Admin only)
exports.resetUserPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Generate a random password if not provided
    const resetPassword = newPassword || `Reset${Math.floor(100000 + Math.random() * 900000)}!`;
    
    // Update user password
    user.password = resetPassword;
    user.passwordChangeRequired = true;
    await user.save();
    
    // In production, you would send this via email
    
    res.status(200).json({
      success: true,
      message: 'Password reset successfully',
      data: {
        id: user._id,
        email: user.email,
        temporaryPassword: resetPassword, // Only for testing, remove in production
        passwordChangeRequired: true
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

// @desc    Delete a user and associated profiles
// @route   DELETE /api/admin/users/:userId
// @access  Private (Admin only)
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Find user first to check if it exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check if user is an admin and prevent deletion if they are the only admin
    if (user.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete the only admin account'
        });
      }
    }
    
    // Clean up associated data based on role
    if (user.role === 'student') {
      // Get student profile
      const student = await Student.findOne({ user: userId });
      
      if (student) {
        // Check if student has active enrollments
        const enrollments = await Enrollment.find({ student: student._id });
        if (enrollments.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'Cannot delete student with active enrollments. Unenroll the student first.',
            data: {
              enrollments: enrollments.length
            }
          });
        }
        
        // Delete student profile
        await Student.findOneAndDelete({ user: userId });
      }
    } else if (user.role === 'lecturer') {
      // Get lecturer profile
      const lecturer = await Lecturer.findOne({ user: userId });
      
      if (lecturer) {
        // Check if lecturer has assigned courses
        if (lecturer.courses && lecturer.courses.length > 0) {
          // Remove lecturer from courses
          await Course.updateMany(
            { assignedLecturers: userId },
            { $pull: { assignedLecturers: userId } }
          );
          
          // Delete schedules for this lecturer
          await Schedule.deleteMany({ lecturer: lecturer._id });
        }
        
        // Delete lecturer profile
        await Lecturer.findOneAndDelete({ user: userId });
      }
    }
    
    // Delete user
    await User.findByIdAndDelete(userId);
    
    res.status(200).json({
      success: true,
      message: 'User deleted successfully',
      data: {
        id: userId,
        role: user.role
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

// @desc    Get lecturer workload statistics
// @route   GET /api/admin/reports/lecturer-workload
// @access  Private (Admin only)
exports.getLecturerWorkload = async (req, res) => {
  try {
    const { department } = req.query;
    
    // Build query based on provided filters
    const query = {};
    
    if (department) {
      query.department = department;
    }
    
    // Get lecturers with user and courses information
    const lecturers = await Lecturer.find(query)
      .populate('user', 'fullName email isActive')
      .populate('courses', 'name code credits');
    
    // Calculate workload statistics
    const workloadStats = lecturers.map(lecturer => {
      const coursesCount = lecturer.courses ? lecturer.courses.length : 0;
      const totalCredits = lecturer.courses ? 
        lecturer.courses.reduce((sum, course) => sum + (course.credits || 3), 0) : 0;
      
      return {
        id: lecturer._id,
        userId: lecturer.user._id,
        fullName: lecturer.user.fullName,
        email: lecturer.user.email,
        department: lecturer.department,
        staffId: lecturer.staffId,
        isActive: lecturer.user.isActive,
        workload: {
          coursesCount,
          totalCredits,
          coursesAssigned: lecturer.courses ? lecturer.courses.map(course => ({
            id: course._id,
            code: course.code,
            name: course.name,
            credits: course.credits
          })) : []
        }
      };
    });
    
    // Sort by number of courses
    workloadStats.sort((a, b) => b.workload.coursesCount - a.workload.coursesCount);
    
    res.status(200).json({
      success: true,
      count: workloadStats.length,
      data: workloadStats
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

// @desc    Create a new announcement
// @route   POST /api/admin/announcements
// @access  Private (Admin only)
exports.createAnnouncement = async (req, res) => {
  try {
    const { title, content, audience, expiresAt } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title and content'
      });
    }
    
    const announcement = await Announcement.create({
      title,
      content,
      audience: audience || 'all',
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      createdBy: req.user.id
    });
    
    res.status(201).json({
      success: true,
      message: 'Announcement created successfully',
      data: announcement
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

// @desc    Get all enrollments with filters
// @route   GET /api/admin/enrollments
// @access  Private (Admin only)
exports.getEnrollments = async (req, res) => {
  try {
    const { 
      studentId, courseId, status, academicSessionId, 
      page = 1, limit = 20, sortBy = 'createdAt', sortOrder = -1 
    } = req.query;
    
    // Build query based on provided filters
    const query = {};
    
    if (studentId) {
      query.student = studentId;
    }
    
    if (courseId) {
      query.course = courseId;
    }
    
    if (status) {
      query.status = status;
    }
    
    if (academicSessionId) {
      query.academicSession = academicSessionId;
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Prepare sort object
    const sort = {};
    sort[sortBy] = parseInt(sortOrder);
    
    // Get enrollments
    const enrollments = await Enrollment.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate({
        path: 'student',
        select: 'matricNumber program',
        populate: {
          path: 'user',
          select: 'fullName email'
        }
      })
      .populate('course', 'name code department')
      .populate('academicSession', 'name semester academicYear');
    
    // Get total count for pagination
    const totalEnrollments = await Enrollment.countDocuments(query);
    
    res.status(200).json({
      success: true,
      count: enrollments.length,
      totalPages: Math.ceil(totalEnrollments / parseInt(limit)),
      currentPage: parseInt(page),
      data: enrollments
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

// @desc    Force enroll a student in a course
// @route   POST /api/admin/enrollments
// @access  Private (Admin only)
exports.forceEnrollStudent = async (req, res) => {
  try {
    const { studentId, courseId, academicSessionId } = req.body;
    
    if (!studentId || !courseId || !academicSessionId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide studentId, courseId, and academicSessionId'
      });
    }
    
    // Check if student exists
    const student = await Student.findById(studentId).populate('user', 'fullName email');
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
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
    
    // Check if academic session exists
    const academicSession = await AcademicSession.findById(academicSessionId);
    if (!academicSession) {
      return res.status(404).json({
        success: false,
        message: 'Academic session not found'
      });
    }
    
    // Check if student is already enrolled in this course for this session
    const existingEnrollment = await Enrollment.findOne({
      student: studentId,
      course: courseId,
      academicSession: academicSessionId
    });
    
    if (existingEnrollment) {
      return res.status(400).json({
        success: false,
        message: 'Student is already enrolled in this course for this academic session',
        data: existingEnrollment
      });
    }
    
    // Create enrollment
    const enrollment = await Enrollment.create({
      student: studentId,
      course: courseId,
      academicSession: academicSessionId,
      status: 'active',
      enrolledBy: req.user.id
    });
    
    res.status(201).json({
      success: true,
      message: 'Student enrolled successfully',
      data: {
        id: enrollment._id,
        student: {
          id: student._id,
          name: student.user.fullName,
          email: student.user.email,
          matricNumber: student.matricNumber
        },
        course: {
          id: course._id,
          code: course.code,
          name: course.name
        },
        academicSession: {
          id: academicSession._id,
          name: academicSession.name
        },
        status: enrollment.status
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

// @desc    Batch enroll students in courses
// @route   POST /api/admin/enrollments/batch
// @access  Private (Admin only)
exports.batchEnrollment = async (req, res) => {
  try {
    const { enrollments, academicSessionId } = req.body;
    
    if (!enrollments || !Array.isArray(enrollments) || enrollments.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of student-course pairs'
      });
    }
    
    if (!academicSessionId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide academicSessionId'
      });
    }
    
    // Check if academic session exists
    const academicSession = await AcademicSession.findById(academicSessionId);
    if (!academicSession) {
      return res.status(404).json({
        success: false,
        message: 'Academic session not found'
      });
    }
    
    const successful = [];
    const errors = [];
    
    for (const enrollment of enrollments) {
      try {
        const { studentId, courseId } = enrollment;
        
        // Skip if missing required fields
        if (!studentId || !courseId) {
          errors.push({
            studentId: studentId || 'unknown',
            courseId: courseId || 'unknown',
            error: 'Missing studentId or courseId'
          });
          continue;
        }
        
        // Check if student exists
        const student = await Student.findById(studentId).populate('user', 'fullName');
        if (!student) {
          errors.push({
            studentId,
            courseId,
            error: 'Student not found'
          });
          continue;
        }
        
        // Check if course exists
        const course = await Course.findById(courseId);
        if (!course) {
          errors.push({
            studentId,
            studentName: student.user.fullName,
            courseId,
            error: 'Course not found'
          });
          continue;
        }
        
        // Check if student is already enrolled in this course for this session
        const existingEnrollment = await Enrollment.findOne({
          student: studentId,
          course: courseId,
          academicSession: academicSessionId
        });
        
        if (existingEnrollment) {
          errors.push({
            studentId,
            studentName: student.user.fullName,
            courseId,
            courseName: course.name,
            error: 'Student already enrolled in this course for this session'
          });
          continue;
        }
        
        // Create enrollment
        const newEnrollment = await Enrollment.create({
          student: studentId,
          course: courseId,
          academicSession: academicSessionId,
          status: 'active',
          enrolledBy: req.user.id
        });
        
        successful.push({
          enrollmentId: newEnrollment._id,
          student: {
            id: student._id,
            name: student.user.fullName,
            matricNumber: student.matricNumber
          },
          course: {
            id: course._id,
            code: course.code,
            name: course.name
          }
        });
        
      } catch (err) {
        errors.push({
          studentId: enrollment.studentId || 'unknown',
          courseId: enrollment.courseId || 'unknown',
          error: err.message
        });
      }
    }
    
    res.status(201).json({
      success: true,
      message: `Created ${successful.length} enrollments with ${errors.length} errors`,
      data: {
        successful,
        errors,
        academicSession: {
          id: academicSession._id,
          name: academicSession.name
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

// @desc    Import enrollments from CSV
// @route   POST /api/admin/enrollments/import
// @access  Private (Admin only)
exports.importEnrollmentsFromCSV = async (req, res) => {
  try {
    const { csvData, academicSessionId } = req.body;
    
    if (!csvData || !Array.isArray(csvData) || csvData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide CSV data as an array'
      });
    }
    
    if (!academicSessionId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide academicSessionId'
      });
    }
    
    // Check if academic session exists
    const academicSession = await AcademicSession.findById(academicSessionId);
    if (!academicSession) {
      return res.status(404).json({
        success: false,
        message: 'Academic session not found'
      });
    }
    
    const successful = [];
    const errors = [];
    
    for (const row of csvData) {
      try {
        const { matricNumber, courseCode } = row;
        
        if (!matricNumber || !courseCode) {
          errors.push({
            row,
            error: 'Missing matricNumber or courseCode'
          });
          continue;
        }
        
        // Find student by matric number
        const student = await Student.findOne({ matricNumber }).populate('user', 'fullName');
        if (!student) {
          errors.push({
            matricNumber,
            courseCode,
            error: 'Student not found with this matric number'
          });
          continue;
        }
        
        // Find course by course code
        const course = await Course.findOne({ code: courseCode });
        if (!course) {
          errors.push({
            matricNumber,
            studentName: student.user.fullName,
            courseCode,
            error: 'Course not found with this code'
          });
          continue;
        }
        
        // Check if student is already enrolled in this course for this session
        const existingEnrollment = await Enrollment.findOne({
          student: student._id,
          course: course._id,
          academicSession: academicSessionId
        });
        
        if (existingEnrollment) {
          errors.push({
            matricNumber,
            studentName: student.user.fullName,
            courseCode,
            courseName: course.name,
            error: 'Student already enrolled in this course for this session'
          });
          continue;
        }
        
        // Create enrollment
        const enrollment = await Enrollment.create({
          student: student._id,
          course: course._id,
          academicSession: academicSessionId,
          status: 'active',
          enrolledBy: req.user.id
        });
        
        successful.push({
          enrollmentId: enrollment._id,
          matricNumber,
          studentName: student.user.fullName,
          courseCode,
          courseName: course.name
        });
        
      } catch (err) {
        errors.push({
          row,
          error: err.message
        });
      }
    }
    
    res.status(201).json({
      success: true,
      message: `Imported ${successful.length} enrollments with ${errors.length} errors`,
      data: {
        successful,
        errors,
        academicSession: {
          id: academicSession._id,
          name: academicSession.name
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

// @desc    Update enrollment status
// @route   PATCH /api/admin/enrollments/:enrollmentId
// @access  Private (Admin only)
exports.updateEnrollmentStatus = async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    const { status } = req.body;
    
    if (!status || !['active', 'completed', 'dropped', 'failed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid status (active, completed, dropped, failed)'
      });
    }
    
    const enrollment = await Enrollment.findById(enrollmentId)
      .populate({
        path: 'student',
        select: 'matricNumber',
        populate: {
          path: 'user',
          select: 'fullName'
        }
      })
      .populate('course', 'code name');
    
    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'Enrollment not found'
      });
    }
    
    enrollment.status = status;
    enrollment.updatedBy = req.user.id;
    enrollment.updatedAt = Date.now();
    
    await enrollment.save();
    
    res.status(200).json({
      success: true,
      message: 'Enrollment status updated successfully',
      data: {
        id: enrollment._id,
        student: {
          id: enrollment.student._id,
          name: enrollment.student.user.fullName,
          matricNumber: enrollment.student.matricNumber
        },
        course: {
          id: enrollment.course._id,
          code: enrollment.course.code,
          name: enrollment.course.name
        },
        status: enrollment.status
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

// @desc    Delete an enrollment
// @route   DELETE /api/admin/enrollments/:enrollmentId
// @access  Private (Admin only)
exports.deleteEnrollment = async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    
    const enrollment = await Enrollment.findById(enrollmentId)
      .populate({
        path: 'student',
        select: 'matricNumber',
        populate: {
          path: 'user',
          select: 'fullName'
        }
      })
      .populate('course', 'code name');
    
    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'Enrollment not found'
      });
    }
    
    // Store information before deletion for response
    const enrollmentInfo = {
      id: enrollment._id,
      student: {
        id: enrollment.student._id,
        name: enrollment.student.user.fullName,
        matricNumber: enrollment.student.matricNumber
      },
      course: {
        id: enrollment.course._id,
        code: enrollment.course.code,
        name: enrollment.course.name
      }
    };
    
    await Enrollment.findByIdAndDelete(enrollmentId);
    
    res.status(200).json({
      success: true,
      message: 'Enrollment deleted successfully',
      data: enrollmentInfo
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

// @desc    Get admin dashboard data
// @route   GET /api/admin/dashboard
// @access  Private (Admin only)
exports.getAdminDashboard = async (req, res) => {
  try {
    // Get counts
    const userCount = await User.countDocuments();
    const studentCount = await Student.countDocuments();
    const lecturerCount = await Lecturer.countDocuments();
    const courseCount = await Course.countDocuments();
    const enrollmentCount = await Enrollment.countDocuments();
    
    // Get recent users
    const recentUsers = await User.find()
      .sort('-createdAt')
      .limit(5)
      .select('fullName email role createdAt');
    
    // Get enrollment statistics
    const enrollmentStats = await Enrollment.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Format enrollment stats
    const formattedEnrollmentStats = {};
    enrollmentStats.forEach(stat => {
      formattedEnrollmentStats[stat._id] = stat.count;
    });
    
    // Get department stats
    const departmentStats = await Course.aggregate([
      {
        $group: {
          _id: '$department',
          courseCount: { $sum: 1 }
        }
      },
      {
        $sort: { courseCount: -1 }
      },
      {
        $limit: 5
      }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        counts: {
          users: userCount,
          students: studentCount,
          lecturers: lecturerCount,
          courses: courseCount,
          enrollments: enrollmentCount
        },
        recentUsers,
        enrollmentStats: formattedEnrollmentStats,
        topDepartments: departmentStats.map(dept => ({
          name: dept._id,
          courseCount: dept.courseCount
        }))
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
