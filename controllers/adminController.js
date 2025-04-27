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

    // Validate required fields
    if (!name || !code || !department) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, code, and department for the course'
      });
    }

    // Check if course with this code already exists
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
      level: level || 100,
      semester: semester || 1,
      prerequisites: prerequisites || [],
      capacity: capacity || 50,
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
      capacity
    } = req.body;

    // Find course first to check if it exists
    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check if updating to an existing course code
    if (code && code !== course.code) {
      const existingCourse = await Course.findOne({ code });
      if (existingCourse) {
        return res.status(400).json({
          success: false,
          message: `Course with code ${code} already exists`
        });
      }
    }

    // Build update object with only provided fields
    const updateData = {};
    if (name) updateData.name = name;
    if (title) updateData.title = title;
    if (code) updateData.code = code;
    if (description !== undefined) updateData.description = description;
    if (credits) updateData.credits = credits;
    if (department) updateData.department = department;
    if (college) updateData.college = college;
    if (level) updateData.level = level;
    if (semester) updateData.semester = semester;
    if (prerequisites) updateData.prerequisites = prerequisites;
    if (capacity) updateData.capacity = capacity;
    
    // Add updatedBy field
    updateData.updatedBy = req.user.id;
    updateData.updatedAt = Date.now();

    // Update the course
    const updatedCourse = await Course.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
    
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
    
    // Find course first to check if it exists
    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Check if course has enrolled students
    if (course.enrolledStudents && course.enrolledStudents.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete course with enrolled students',
        data: {
          enrolledCount: course.enrolledStudents.length
        }
      });
    }
    
    // Update lecturers to remove this course
    await Lecturer.updateMany(
      { courses: id },
      { $pull: { courses: id } }
    );
    
    // Delete related schedules
    await Schedule.deleteMany({ course: id });
    
    // Delete the course
    await Course.findByIdAndDelete(id);
    
    res.status(200).json({
      success: true,
      message: 'Course deleted successfully',
      data: {
        id,
        code: course.code,
        name: course.name
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

// @desc    Create multiple courses at once
// @route   POST /api/admin/courses/bulk
// @access  Private (Admin only)
exports.createCoursesBulk = async (req, res) => {
  try {
    const { courses } = req.body;
    
    if (!courses || !Array.isArray(courses) || courses.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of courses'
      });
    }
    
    const createdCourses = [];
    const errors = [];
    
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
          semester
        } = courseData;
        
        // Validate required fields
        if (!name || !code || !department) {
          errors.push({
            code: code || 'unknown',
            error: 'Missing required fields (name, code, department)'
          });
          continue;
        }
        
        // Check if course already exists
        const existingCourse = await Course.findOne({ code });
        if (existingCourse) {
          errors.push({
            code,
            error: 'Course with this code already exists'
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
          level: level || 100,
          semester: semester || 1,
          prerequisites: courseData.prerequisites || [],
          capacity: courseData.capacity || 50,
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

// @desc    Batch update courses
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
    
    const results = {
      successful: [],
      failed: []
    };
    
    for (const update of updates) {
      try {
        const { courseId, data } = update;
        
        if (!courseId || !data) {
          results.failed.push({
            courseId: courseId || 'unknown',
            error: 'Missing courseId or update data'
          });
          continue;
        }
        
        // Find course first to check if it exists
        const course = await Course.findById(courseId);
        if (!course) {
          results.failed.push({
            courseId,
            error: 'Course not found'
          });
          continue;
        }
        
        // Check if updating to an existing course code
        if (data.code && data.code !== course.code) {
          const existingCourse = await Course.findOne({ code: data.code });
          if (existingCourse) {
            results.failed.push({
              courseId,
              code: data.code,
              error: 'Course code already exists'
            });
            continue;
          }
        }
        
        // Update the course
        const updatedCourse = await Course.findByIdAndUpdate(
          courseId,
          { 
            $set: { ...data, updatedBy: req.user.id, updatedAt: Date.now() }
          },
          { new: true, runValidators: true }
        );
        
        results.successful.push({
          courseId,
          code: updatedCourse.code,
          name: updatedCourse.name,
          updatedFields: Object.keys(data)
        });
      } catch (err) {
        results.failed.push({
          courseId: update.courseId || 'unknown',
          error: err.message
        });
      }
    }
    
    res.status(200).json({
      success: true,
      message: `Updated ${results.successful.length} courses with ${results.failed.length} errors`,
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

// @desc    Set up a department with courses
// @route   POST /api/admin/department-setup
// @access  Private (Admin only)
exports.setupDepartment = async (req, res) => {
  try {
    const { department, college, courses } = req.body;
    
    if (!department) {
      return res.status(400).json({
        success: false,
        message: 'Please provide department name'
      });
    }
    
    const results = {
      department,
      college: college || department,
      coursesCreated: 0,
      errors: []
    };
    
    // Create courses if provided
    if (courses && Array.isArray(courses) && courses.length > 0) {
      for (const courseData of courses) {
        try {
          // Add department and college to each course
          const enrichedCourseData = {
            ...courseData,
            department,
            college: college || department,
            createdBy: req.user.id
          };
          
          // Check if course code already exists
          const existingCourse = await Course.findOne({ code: courseData.code });
          if (existingCourse) {
            results.errors.push({
              code: courseData.code,
              error: 'Course code already exists'
            });
            continue;
          }
          
          // Create the course
          await Course.create(enrichedCourseData);
          results.coursesCreated++;
        } catch (err) {
          results.errors.push({
            code: courseData.code || 'Unknown',
            error: err.message
          });
        }
      }
    }
    
    res.status(201).json({
      success: true,
      message: `Department setup completed with ${results.coursesCreated} courses created`,
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

// @desc    Update department and its courses
// @route   PUT /api/admin/departments/:departmentName
// @access  Private (Admin only)
exports.updateDepartment = async (req, res) => {
  try {
    const { departmentName } = req.params;
    const { newName, college, courses } = req.body;
    
    // Find all courses in this department
    const existingCourses = await Course.find({ department: departmentName });
    
    if (existingCourses.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Department '${departmentName}' not found or has no courses`
      });
    }
    
    const updates = {};
    const results = {
      department: {
        oldName: departmentName,
        newName: newName || departmentName
      },
      coursesUpdated: 0,
      coursesAdded: 0,
      errors: []
    };
    
    // Update department name and college if provided
    if (newName || college) {
      if (newName) updates.department = newName;
      if (college) updates.college = college;
      
      // Update all courses in the department
      const updateResult = await Course.updateMany(
        { department: departmentName },
        { $set: updates }
      );
      results.coursesUpdated = updateResult.modifiedCount;
    }
    
    // Add new courses if provided
    if (courses && Array.isArray(courses) && courses.length > 0) {
      for (const courseData of courses) {
        try {
          // Add department and college to each course
          const enrichedCourseData = {
            ...courseData,
            department: newName || departmentName,
            college: college || existingCourses[0].college,
            createdBy: req.user.id
          };
          
          // Check if course code already exists
          const existingCourse = await Course.findOne({ code: courseData.code });
          if (existingCourse) {
            results.errors.push({
              code: courseData.code,
              error: 'Course code already exists'
            });
            continue;
          }
          
          // Create the course
          await Course.create(enrichedCourseData);
          results.coursesAdded++;
        } catch (err) {
          results.errors.push({
            code: courseData.code || 'Unknown',
            error: err.message
          });
        }
      }
    }
    
    res.status(200).json({
      success: true,
      message: 'Department updated successfully',
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

// @desc    Delete department and its courses
// @route   DELETE /api/admin/departments/:departmentName
// @access  Private (Admin only)
exports.deleteDepartment = async (req, res) => {
  try {
    const { departmentName } = req.params;
    const { deleteMode } = req.query; // 'full' or 'department-only'
    
    // Find all courses in this department
    const courses = await Course.find({ department: departmentName });
    
    if (courses.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Department '${departmentName}' not found or has no courses`
      });
    }
    
    // Check if any courses have enrolled students
    const coursesWithStudents = courses.filter(c => 
      c.enrolledStudents && c.enrolledStudents.length > 0
    );
    
    if (coursesWithStudents.length > 0 && deleteMode === 'full') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete department with enrolled students',
        data: {
          coursesWithStudents: coursesWithStudents.map(c => ({
            id: c._id,
            code: c.code,
            name: c.name,
            studentCount: c.enrolledStudents.length
          }))
        }
      });
    }
    
    const result = {
      department: departmentName,
      coursesCount: courses.length,
      coursesDeleted: 0,
      lecturersAffected: 0
    };
    
    // Delete courses or remove department association
    if (deleteMode === 'full') {
      // Get course IDs
      const courseIds = courses.map(c => c._id);
      
      // Remove courses from lecturers' course lists
      const updateLecturerResult = await Lecturer.updateMany(
        { courses: { $in: courseIds } },
        { $pull: { courses: { $in: courseIds } } }
      );
      result.lecturersAffected = updateLecturerResult.modifiedCount;
      
      // Delete all schedules for these courses
      await Schedule.deleteMany({ course: { $in: courseIds } });
      
      // Delete all enrollments for these courses
      await Enrollment.deleteMany({ course: { $in: courseIds } });
      
      // Delete the courses
      const deleteResult = await Course.deleteMany({ department: departmentName });
      result.coursesDeleted = deleteResult.deletedCount;
    } else {
      // Just update courses to remove department association
      await Course.updateMany(
        { department: departmentName },
        { $set: { department: 'Unassigned' } }
      );
      result.coursesReassigned = courses.length;
    }
    
    res.status(200).json({
      success: true,
      message: deleteMode === 'full' 
        ? `Department and all courses deleted successfully` 
        : `Department association removed from courses`,
      data: result
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

// @desc    Get courses by department
// @route   GET /api/admin/courses/department/:departmentName
// @access  Private (Admin only)
exports.getCoursesByDepartment = async (req, res) => {
  try {
    const { departmentName } = req.params;
    
    const courses = await Course.find({ department: departmentName })
      .sort({ code: 1 })
      .populate('assignedLecturers', 'fullName email');
    
    res.status(200).json({
      success: true,
      count: courses.length,
      data: courses
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
      .populate('user', 'fullName email')
      .populate('courses', 'name code');
    
    res.status(200).json({
      success: true,
      count: lecturers.length,
      data: lecturers
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

// @desc    Assign course to lecturer
// @route   POST /api/admin/assign-course
// @access  Private (Admin only)
exports.assignCourse = async (req, res) => {
  try {
    const { lecturerId, courseId } = req.body;
    
    if (!lecturerId || !courseId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide lecturer and course IDs'
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
    
    // Check if lecturer exists
    const lecturer = await Lecturer.findOne({ user: lecturerId });
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer not found'
      });
    }
    
    // Check if already assigned
    if (course.assignedLecturers.includes(lecturerId)) {
      return res.status(400).json({
        success: false,
        message: 'Lecturer is already assigned to this course'
      });
    }
    
    // Update course
    course.assignedLecturers.push(lecturerId);
    await course.save();
    
    // Update lecturer
    if (!lecturer.courses.includes(courseId)) {
      lecturer.courses.push(courseId);
      await lecturer.save();
    }
    
    res.status(200).json({
      success: true,
      message: 'Course assigned successfully',
      data: {
        course: {
          id: course._id,
          name: course.name,
          code: course.code
        },
        lecturer: {
          id: lecturerId,
          courses: lecturer.courses.length
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

// @desc    Assign multiple courses to lecturer
// @route   POST /api/admin/assign-courses
// @access  Private (Admin only)
exports.assignMultipleCourses = async (req, res) => {
  try {
    const { lecturerId, courseIds } = req.body;
    
    if (!lecturerId || !courseIds || !Array.isArray(courseIds)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide lecturer ID and an array of course IDs'
      });
    }
    
    // Check if lecturer exists
    const lecturer = await Lecturer.findOne({ user: lecturerId });
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer not found'
      });
    }
    
    const results = {
      successful: [],
      failed: []
    };
    
    for (const courseId of courseIds) {
      try {
        // Check if course exists
        const course = await Course.findById(courseId);
        if (!course) {
          results.failed.push({
            courseId,
            error: 'Course not found'
          });
          continue;
        }
        
        // Check if already assigned
        if (course.assignedLecturers.includes(lecturerId)) {
          results.failed.push({
            courseId,
            code: course.code,
            error: 'Lecturer is already assigned to this course'
          });
          continue;
        }
        
        // Update course
        course.assignedLecturers.push(lecturerId);
        await course.save();
        
        // Update lecturer
        if (!lecturer.courses.includes(courseId)) {
          lecturer.courses.push(courseId);
        }
        
        results.successful.push({
          courseId,
          code: course.code,
          name: course.name
        });
      } catch (err) {
        results.failed.push({
          courseId,
          error: err.message
        });
      }
    }
    
    // Save lecturer after all updates
    await lecturer.save();
    
    res.status(200).json({
      success: true,
      message: `Assigned ${results.successful.length} courses with ${results.failed.length} failures`,
      data: {
        lecturerId,
        totalCourses: lecturer.courses.length,
        results
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

// @desc    Remove lecturer from course
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
    const lecturer = await Lecturer.findOne({ user: lecturerId });
    if (!lecturer) {
      return res.status(404).json({
        success: false,
        message: 'Lecturer not found'
      });
    }
    
    // Check if lecturer is assigned to course
    if (!course.assignedLecturers.includes(lecturerId)) {
      return res.status(400).json({
        success: false,
        message: 'This lecturer is not assigned to the course'
      });
    }
    
    // Remove lecturer from course
    course.assignedLecturers = course.assignedLecturers.filter(id => 
      id.toString() !== lecturerId.toString()
    );
    await course.save();
    
    // Remove course from lecturer
    lecturer.courses = lecturer.courses.filter(id => 
      id.toString() !== courseId.toString()
    );
    await lecturer.save();
    
    // Also delete any schedules for this lecturer-course pair
    await Schedule.deleteMany({
      course: courseId,
      lecturer: lecturerId
    });
    
    res.status(200).json({
      success: true,
      message: 'Lecturer removed from course successfully',
      data: {
        course: {
          id: course._id,
          name: course.name,
          code: course.code
        },
        lecturer: {
          id: lecturer.user,
          courses: lecturer.courses.length
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

// @desc    Update lecturer assignments for course
// @route   PUT /api/admin/courses/:courseId/lecturers
// @access  Private (Admin only)
exports.updateCourseLecturers = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { lecturerIds } = req.body;
    
    if (!lecturerIds || !Array.isArray(lecturerIds)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of lecturer IDs'
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
    
    // Get the existing lecturer assignments
    const existingLecturerIds = [...course.assignedLecturers.map(id => id.toString())];
    
    // Determine which lecturers to add and which to remove
    const lecturersToAdd = lecturerIds.filter(id => !existingLecturerIds.includes(id));
    const lecturersToRemove = existingLecturerIds.filter(id => !lecturerIds.includes(id));
    
    // Update course with new lecturer assignments
    course.assignedLecturers = lecturerIds;
    await course.save();
    
    // Add course to new lecturers
    for (const lecturerId of lecturersToAdd) {
      const lecturer = await Lecturer.findOne({ user: lecturerId });
      if (lecturer && !lecturer.courses.includes(courseId)) {
        lecturer.courses.push(courseId);
        await lecturer.save();
      }
    }
    
    // Remove course from removed lecturers
    for (const lecturerId of lecturersToRemove) {
      const lecturer = await Lecturer.findOne({ user: lecturerId });
      if (lecturer) {
        lecturer.courses = lecturer.courses.filter(id => 
          id.toString() !== courseId.toString()
        );
        await lecturer.save();
        
        // Delete schedules for removed lecturer-course pair
        await Schedule.deleteMany({
          course: courseId,
          lecturer: lecturerId
        });
      }
    }
    
    res.status(200).json({
      success: true,
      message: 'Course lecturers updated successfully',
      data: {
        course: {
          id: course._id,
          name: course.name,
          code: course.code,
          lecturerCount: course.assignedLecturers.length
        },
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

// @desc    Create a new user
// @route   POST /api/admin/users
// @access  Private (Admin only)
exports.createUser = async (req, res) => {
  try {
    const { 
      fullName, 
      email, 
      password, 
      role, 
      matricNumber, 
      program, 
      staffId, 
      department,
      college
    } = req.body;
    
    // Validate required fields
    if (!fullName || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Please provide fullName, email, password, and role'
      });
    }
    
    // Verify role is valid
    if (!['student', 'lecturer', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be student, lecturer, or admin'
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
    
    // Create user
    const user = await User.create({
      fullName,
      email,
      password,
      role,
      isEmailVerified: true, // Admin created accounts are pre-verified
      passwordChangeRequired: true, // Force password change on first login
      createdBy: req.user.id
    });
    
    // Create role-specific profile
    if (role === 'lecturer') {
      if (!department) {
        return res.status(400).json({
          success: false,
          message: 'Department is required for lecturers'
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
    
    // Remove password from response
    user.password = undefined;
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: user
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
        
        // Remove student from courses
        await Course.updateMany(
          { enrolledStudents: userId },
          { $pull: { enrolledStudents: userId } }
        );
        
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

// @desc    Get enrollments with filters and pagination
// @route   GET /api/admin/enrollments
// @access  Private (Admin only)
exports.getEnrollments = async (req, res) => {
  try {
    const { studentId, courseId, status, page = 1, limit = 10 } = req.query;
    
    // Build query based on provided filters
    const query = {};
    
    if (studentId) {
      const student = await Student.findOne({ user: studentId });
      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student not found'
        });
      }
      query.student = student._id;
    }
    
    if (courseId) {
      query.course = courseId;
    }
    
    if (status) {
      query.status = status;
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get enrollments
    const enrollments = await Enrollment.find(query)
      .populate({
        path: 'student',
        populate: {
          path: 'user',
          select: 'fullName email'
        }
      })
      .populate('course', 'name code department')
      .sort('-createdAt')
      .skip(skip)
      .limit(parseInt(limit));
    
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

// @desc    Force enroll a student to a course
// @route   POST /api/admin/enrollments
// @access  Private (Admin only)
exports.forceEnrollStudent = async (req, res) => {
  try {
    const { studentId, courseId, status = 'active', program } = req.body;
    
    if (!studentId || !courseId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide studentId and courseId'
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
    
    // If program is provided, update the student's program
    if (program && !student.program) {
      student.program = program;
      await student.save();
    }
    
    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Check if enrollment already exists
    const existingEnrollment = await Enrollment.findOne({
      student: student._id,
      course: courseId
    });
    
    if (existingEnrollment) {
      return res.status(400).json({
        success: false,
        message: 'Student is already enrolled in this course',
        data: existingEnrollment
      });
    }
    
    // Create enrollment
    const enrollment = await Enrollment.create({
      student: student._id,
      course: courseId,
      status,
      enrolledBy: req.user.id
    });
    
    // Add student to course's enrolled students list
    if (!course.enrolledStudents.includes(studentId)) {
      course.enrolledStudents.push(studentId);
      await course.save();
    }
    
    res.status(201).json({
      success: true,
      message: 'Student enrolled successfully',
      data: enrollment
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

// @desc    Batch enroll students to courses
// @route   POST /api/admin/enrollments/batch
// @access  Private (Admin only)
exports.batchEnrollment = async (req, res) => {
  try {
    const { action, studentIds, courseId, courseIds, defaultProgram = "General Studies" } = req.body;
    
    if (!action || !['enroll', 'unenroll'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Please specify a valid action (enroll or unenroll)'
      });
    }
    
    const results = {
      successful: [],
      failed: []
    };
    
    // Scenario 1: Multiple students in one course
    if (studentIds && courseId) {
      if (!Array.isArray(studentIds)) {
        return res.status(400).json({
          success: false,
          message: 'studentIds must be an array'
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
      
      for (const studentId of studentIds) {
        try {
          const student = await Student.findOne({ user: studentId });
          
          if (!student) {
            results.failed.push({
              studentId,
              error: 'Student not found'
            });
            continue;
          }
          
          // Update student if missing program
          if (!student.program) {
            student.program = defaultProgram;
            await student.save();
          }
          
          if (action === 'enroll') {
            // Check if already enrolled
            const existingEnrollment = await Enrollment.findOne({
              student: student._id,
              course: courseId
            });
            
            if (existingEnrollment) {
              results.failed.push({
                studentId,
                error: 'Already enrolled in this course'
              });
              continue;
            }
            
            // Create enrollment
            await Enrollment.create({
              student: student._id,
              course: courseId,
              status: 'active',
              enrolledBy: req.user.id
            });
            
            // Add student to course's enrolled students list
            if (!course.enrolledStudents.includes(studentId)) {
              course.enrolledStudents.push(studentId);
            }
            
            results.successful.push({
              studentId,
              action: 'enrolled',
              course: course.code
            });
          } else if (action === 'unenroll') {
            // Check if enrollment exists
            const enrollment = await Enrollment.findOne({
              student: student._id,
              course: courseId
            });
            
            if (!enrollment) {
              results.failed.push({
                studentId,
                error: 'Not enrolled in this course'
              });
              continue;
            }
            
            // Remove enrollment
            await Enrollment.findByIdAndDelete(enrollment._id);
            
            // Remove student from course's enrolled students list
            course.enrolledStudents = course.enrolledStudents.filter(id => 
              id.toString() !== studentId.toString()
            );
            
            results.successful.push({
              studentId,
              action: 'unenrolled',
              course: course.code
            });
          }
        } catch (err) {
          results.failed.push({
            studentId,
            error: err.message
          });
        }
      }
      
      // Save course after all updates
      await course.save();
    }
    // Scenario 2: One student in multiple courses
    else if (courseIds && req.body.studentId) {
      if (!Array.isArray(courseIds)) {
        return res.status(400).json({
          success: false,
          message: 'courseIds must be an array'
        });
      }
      
      const studentId = req.body.studentId;
      const student = await Student.findOne({ user: studentId });
      
      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student not found'
        });
      }
      
      // Update student if missing program
      if (!student.program) {
        student.program = defaultProgram;
        await student.save();
      }
      
      for (const courseId of courseIds) {
        try {
          const course = await Course.findById(courseId);
          
          if (!course) {
            results.failed.push({
              courseId,
              error: 'Course not found'
            });
            continue;
          }
          
          if (action === 'enroll') {
            // Check if already enrolled
            const existingEnrollment = await Enrollment.findOne({
              student: student._id,
              course: courseId
            });
            
            if (existingEnrollment) {
              results.failed.push({
                courseId,
                code: course.code,
                error: 'Student already enrolled in this course'
              });
              continue;
            }
            
            // Create enrollment
            await Enrollment.create({
              student: student._id,
              course: courseId,
              status: 'active',
              enrolledBy: req.user.id
            });
            
            // Add student to course's enrolled students list
            if (!course.enrolledStudents.includes(studentId)) {
              course.enrolledStudents.push(studentId);
              await course.save();
            }
            
            results.successful.push({
              courseId,
              code: course.code,
              action: 'enrolled'
            });
          } else if (action === 'unenroll') {
            // Check if enrollment exists
            const enrollment = await Enrollment.findOne({
              student: student._id,
              course: courseId
            });
            
            if (!enrollment) {
              results.failed.push({
                courseId,
                code: course.code,
                error: 'Student not enrolled in this course'
              });
              continue;
            }
            
            // Remove enrollment
            await Enrollment.findByIdAndDelete(enrollment._id);
            
            // Remove student from course's enrolled students list
            course.enrolledStudents = course.enrolledStudents.filter(id => 
              id.toString() !== studentId.toString()
            );
            await course.save();
            
            results.successful.push({
              courseId,
              code: course.code,
              action: 'unenrolled'
            });
          }
        } catch (err) {
          results.failed.push({
            courseId,
            error: err.message
          });
        }
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Please provide either (studentIds and courseId) or (studentId and courseIds)'
      });
    }
    
    res.status(200).json({
      success: true,
      message: `${action.charAt(0).toUpperCase() + action.slice(1)}ed ${results.successful.length} with ${results.failed.length} failures`,
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

// @desc    Import enrollments from CSV data
// @route   POST /api/admin/enrollments/import
// @access  Private (Admin only)
exports.importEnrollmentsFromCSV = async (req, res) => {
  try {
    const { enrollments, createMissingUsers = false, defaultPassword = "Password123!", defaultProgram = "General Studies" } = req.body;
    
    if (!enrollments || !Array.isArray(enrollments) || enrollments.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of enrollment data'
      });
    }
    
    const results = {
      successful: [],
      failed: []
    };
    
    for (const item of enrollments) {
      try {
        const { courseCode, studentEmail, fullName, matricNumber, program } = item;
        
        // Validate required fields
        if (!courseCode || !studentEmail) {
          results.failed.push({
            studentEmail: studentEmail || 'unknown',
            courseCode: courseCode || 'unknown',
            error: 'Missing required fields (courseCode, studentEmail)'
          });
          continue;
        }
        
        // Find course by code
        const course = await Course.findOne({ code: courseCode });
        if (!course) {
          results.failed.push({
            studentEmail,
            courseCode,
            error: 'Course not found'
          });
          continue;
        }
        
        // Find user by email
        let user = await User.findOne({ email: studentEmail });
        
        // Create user if not found and createMissingUsers is true
        if (!user && createMissingUsers) {
          if (!fullName) {
            results.failed.push({
              studentEmail,
              courseCode,
              error: 'Full name is required for creating a new user'
            });
            continue;
          }
          
          // Create user
          user = await User.create({
            fullName,
            email: studentEmail,
            password: defaultPassword,
            role: 'student',
            isEmailVerified: true,
            passwordChangeRequired: true,
            createdBy: req.user.id
          });
          
          // Create student profile
          await Student.create({
            user: user._id,
            matricNumber: matricNumber || `MAT${Math.floor(100000 + Math.random() * 900000)}`,
            program: program || defaultProgram,
            department: 'Unassigned'
          });
        } else if (!user) {
          results.failed.push({
            studentEmail,
            courseCode,
            error: 'Student not found and creation is disabled'
          });
          continue;
        }
        
        // Check if user is a student
        if (user.role !== 'student') {
          results.failed.push({
            studentEmail,
            courseCode,
            error: 'User is not a student'
          });
          continue;
        }
        
        // Get the student profile
        const student = await Student.findOne({ user: user._id });
        
        // Update student if missing program
        if (student && !student.program) {
          student.program = program || defaultProgram;
          await student.save();
        }
        
        // Check if already enrolled
        const existingEnrollment = await Enrollment.findOne({
          student: student._id,
          course: course._id
        });
        
        if (existingEnrollment) {
          results.failed.push({
            studentEmail,
            courseCode,
            error: 'Student already enrolled in this course'
          });
          continue;
        }
        
        // Create enrollment
        await Enrollment.create({
          student: student._id,
          course: course._id,
          status: 'active',
          enrolledBy: req.user.id
        });
        
        // Add student to course's enrolled students list
        if (!course.enrolledStudents.includes(user._id)) {
          course.enrolledStudents.push(user._id);
          await course.save();
        }
        
        results.successful.push({
          studentEmail,
          studentName: user.fullName,
          courseCode,
          courseName: course.name
        });
      } catch (err) {
        results.failed.push({
          studentEmail: item.studentEmail || 'unknown',
          courseCode: item.courseCode || 'unknown',
          error: err.message
        });
      }
    }
    
    res.status(200).json({
      success: true,
      message: `Enrolled ${results.successful.length} with ${results.failed.length} failures`,
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

// @desc    Update enrollment status (grade, remarks)
// @route   PATCH /api/admin/enrollments/:enrollmentId
// @access  Private (Admin only)
exports.updateEnrollmentStatus = async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    const { status, grade, remarks } = req.body;
    
    // Find enrollment first to check if it exists
    const enrollment = await Enrollment.findById(enrollmentId);
    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'Enrollment not found'
      });
    }
    
    // Update fields if provided
    if (status) enrollment.status = status;
    if (grade !== undefined) enrollment.grade = grade;
    if (remarks !== undefined) enrollment.remarks = remarks;
    
    // Add updated by info
    enrollment.updatedBy = req.user.id;
    enrollment.updatedAt = Date.now();
    
    // Save the updated enrollment
    await enrollment.save();
    
    res.status(200).json({
      success: true,
      message: 'Enrollment updated successfully',
      data: enrollment
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
    
    // Find enrollment first to check if it exists
    const enrollment = await Enrollment.findById(enrollmentId);
    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'Enrollment not found'
      });
    }
    
    // Remove student from course's enrolled students list
    const course = await Course.findById(enrollment.course);
    if (course) {
      const student = await Student.findById(enrollment.student);
      if (student) {
        course.enrolledStudents = course.enrolledStudents.filter(id => 
          id.toString() !== student.user.toString()
        );
        await course.save();
      }
    }
    
    // Delete the enrollment
    await Enrollment.findByIdAndDelete(enrollmentId);
    
    res.status(200).json({
      success: true,
      message: 'Enrollment deleted successfully',
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

// @desc    Get all users with filtering and pagination
// @route   GET /api/admin/users
// @access  Private (Admin only)
exports.getUsers = async (req, res) => {
  try {
    const { role, search, isActive, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = -1 } = req.query;
    
    // Build query based on provided filters
    const query = {};
    
    if (role) {
      query.role = role;
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
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
    sort[sortBy] = parseInt(sortOrder);
    
    // Get users
    const users = await User.find(query)
      .select('-password')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const totalUsers = await User.countDocuments(query);
    
    // Get additional profile data
    const enhancedUsers = await Promise.all(users.map(async (user) => {
      const userData = user.toObject();
      
      if (user.role === 'student') {
        const student = await Student.findOne({ user: user._id });
        if (student) {
          userData.profile = {
            matricNumber: student.matricNumber,
            program: student.program,
            department: student.department
          };
        }
      } else if (user.role === 'lecturer') {
        const lecturer = await Lecturer.findOne({ user: user._id });
        if (lecturer) {
          userData.profile = {
            staffId: lecturer.staffId,
            department: lecturer.department,
            college: lecturer.college,
            coursesCount: lecturer.courses ? lecturer.courses.length : 0
          };
        }
      }
      
      return userData;
    }));
    
    res.status(200).json({
      success: true,
      count: enhancedUsers.length,
      totalPages: Math.ceil(totalUsers / parseInt(limit)),
      currentPage: parseInt(page),
      data: enhancedUsers
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

// @desc    Get user by ID
// @route   GET /api/admin/users/:userId
// @access  Private (Admin only)
exports.getUserById = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Get additional profile data based on role
    const userData = user.toObject();
    
    if (user.role === 'student') {
      const student = await Student.findOne({ user: user._id });
      if (student) {
        userData.profile = {
          matricNumber: student.matricNumber,
          program: student.program,
          department: student.department,
          enrollments: await Enrollment.countDocuments({ student: student._id })
        };
      }
    } else if (user.role === 'lecturer') {
      const lecturer = await Lecturer.findOne({ user: user._id });
      if (lecturer) {
        userData.profile = {
          staffId: lecturer.staffId,
          department: lecturer.department,
          college: lecturer.college,
          courses: lecturer.courses ? lecturer.courses.length : 0
        };
        
        // Get courses
        if (lecturer.courses && lecturer.courses.length > 0) {
          const courses = await Course.find({
            _id: { $in: lecturer.courses }
          }).select('name code department');
          
          userData.courses = courses;
        }
      }
    }
    
    res.status(200).json({
      success: true,
      data: userData
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
exports.getFAQs = async (req, res) => {
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

// @desc    Get all announcements
// @route   GET /api/admin/announcements
// @access  Private (Admin only)
exports.getAnnouncements = async (req, res) => {
  try {
    const announcements = await Announcement.find()
      .sort('-createdAt')
      .limit(req.query.limit ? parseInt(req.query.limit) : undefined);
    
    res.status(200).json({
      success: true,
      count: announcements.length,
      data: announcements
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

// @desc    Get announcement by ID
// @route   GET /api/admin/announcements/:announcementId
// @access  Private (Admin only)
exports.getAnnouncementById = async (req, res) => {
  try {
    const { announcementId } = req.params;
    
    const announcement = await Announcement.findById(announcementId);
    
    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }
    
    res.status(200).json({
      success: true,
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

// @desc    Update an announcement
// @route   PUT /api/admin/announcements/:announcementId
// @access  Private (Admin only)
exports.updateAnnouncement = async (req, res) => {
  try {
    const { announcementId } = req.params;
    const { title, content, audience, expiresAt, isActive } = req.body;
    
    const announcement = await Announcement.findById(announcementId);
    
    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }
    
    if (title) announcement.title = title;
    if (content) announcement.content = content;
    if (audience) announcement.audience = audience;
    if (expiresAt) announcement.expiresAt = new Date(expiresAt);
    if (isActive !== undefined) announcement.isActive = isActive;
    
    announcement.updatedAt = Date.now();
    announcement.updatedBy = req.user.id;
    
    await announcement.save();
    
    res.status(200).json({
      success: true,
      message: 'Announcement updated successfully',
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

// @desc    Delete an announcement
// @route   DELETE /api/admin/announcements/:announcementId
// @access  Private (Admin only)
exports.deleteAnnouncement = async (req, res) => {
  try {
    const { announcementId } = req.params;
    
    const announcement = await Announcement.findByIdAndDelete(announcementId);
    
    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Announcement deleted successfully',
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
    
    if (question) faq.question = question;
    if (answer) faq.answer = answer;
    if (category) faq.category = category;
    if (order !== undefined) faq.order = order;
    if (isActive !== undefined) faq.isActive = isActive;
    
    faq.updatedAt = Date.now();
    faq.updatedBy = req.user.id;
    
    await faq.save();
    
    res.status(200).json({
      success: true,
      message: 'FAQ updated successfully',
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

// @desc    Get all academic sessions
// @route   GET /api/admin/academic-sessions
// @access  Private (Admin only)
exports.getAcademicSessions = async (req, res) => {
  try {
    const academicSessions = await AcademicSession.find()
      .sort({ startDate: -1 });
    
    res.status(200).json({
      success: true,
      count: academicSessions.length,
      data: academicSessions
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

// @desc    Get system settings
// @route   GET /api/admin/settings
// @access  Private (Admin only)
exports.getSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    
    if (!settings) {
      settings = await Settings.create({
        academicCalendar: {
          semesterStart: null,
          semesterEnd: null,
          holidayDates: []
        }
      });
    }
    
    res.status(200).json({
      success: true,
      data: settings
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
// @route   GET /api/admin/courses
// @access  Private (Admin only)
exports.getCourses = async (req, res) => {
  try {
    const { department, search, page = 1, limit = 20, sortBy = 'code', sortOrder = 1 } = req.query;
    
    // Build query based on provided filters
    const query = {};
    
    if (department) {
      query.department = department;
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
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
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const totalCourses = await Course.countDocuments(query);
    
    res.status(200).json({
      success: true,
      count: courses.length,
      totalPages: Math.ceil(totalCourses / parseInt(limit)),
      currentPage: parseInt(page),
      data: courses
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
      
      // Get scheduled hours per week
      const schedules = []; // This would require a separate query to get all schedules
      
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