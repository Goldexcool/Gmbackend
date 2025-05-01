const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/authMiddleware');
const fileUpload = require('../middleware/fileUpload');
const examTimetableController = require('../controllers/examTimetableController');
const academicSessionController = require('../controllers/academicSessionController');

// Apply auth middleware to all routes
router.use(protect);
router.use(authorize('admin'));

// User management routes
router.get('/users', adminController.getAllUsers);
router.get('/users/:id', adminController.getUserById);
router.put('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);
router.post('/users', adminController.createUser);
router.post('/users/bulk', adminController.createUsersBulk);
router.patch('/users/:userId/status', adminController.toggleUserStatus);
router.patch('/users/:userId/role', adminController.changeUserRole);
router.post('/users/:userId/reset-password', adminController.resetUserPassword);

// Student management
router.get('/students', adminController.getAllStudents);
router.post('/students', adminController.createStudent);
router.put('/students/:id', adminController.updateStudent);
router.delete('/students/:id', adminController.deleteStudent);
router.get('/students/:userId/timetables', examTimetableController.getStudentTimetableByAdmin);

// Lecturer management
router.get('/lecturers', adminController.getAllLecturers);
router.post('/lecturers', adminController.createLecturer);
router.put('/lecturers/:id', adminController.updateLecturer);
router.delete('/lecturers/:id', adminController.deleteLecturer);
router.get('/lecturers/department/:departmentName', adminController.getLecturersByDepartment);
router.post('/assign-course', adminController.assignCourse);
router.post('/assign-courses', adminController.assignMultipleCourses);
router.delete('/courses/:courseId/lecturers/:lecturerId', adminController.removeLecturerFromCourse);
router.put('/courses/:courseId/lecturers', adminController.updateCourseLecturers);

// Department management
router.get('/departments', adminController.getAllDepartments);
router.post('/departments', adminController.createDepartment);
router.put('/departments/:id', adminController.updateDepartment);
router.delete('/departments/:id', adminController.deleteDepartment);
router.get('/departments/by-name/:departmentName', adminController.getDepartmentDetails);

// Course management
router.post('/courses/bulk', adminController.createCoursesBulk);
router.patch('/courses/batch', adminController.batchUpdateCourses);
router.get('/courses/department/:departmentName', adminController.getCoursesByDepartment);
router.get('/courses/session/:sessionId', adminController.getCoursesBySession);
router.get('/courses', adminController.getAllCourses);
router.post('/courses', adminController.createCourse);
router.put('/courses/:id', adminController.updateCourse);
router.delete('/courses/:id', adminController.deleteCourse);
router.delete('/schedules/course/:courseId', adminController.deleteCoursesSchedules);

// Academic session management
router.get('/academic-sessions', adminController.getAllAcademicSessions);
router.post('/academic-sessions', adminController.createAcademicSession);
router.put('/academic-sessions/:id', adminController.updateAcademicSession);
router.delete('/academic-sessions/:id', adminController.deleteAcademicSession);
router.put('/academic-sessions/:id/activate', adminController.setActiveSession);
router.put('/academic-sessions/:id/archive', adminController.archiveAcademicSession);
router.post('/academic-sessions/transition', adminController.prepareSessionTransition);

// Dashboard statistics
router.get('/dashboard', adminController.getDashboardStats);

// System settings
router.get('/settings', adminController.getSystemSettings);
router.put('/settings', adminController.updateSystemSettings);

// Reports & Analytics
router.get('/reports/enrollments', adminController.getEnrollmentStats);
router.get('/reports/lecturer-workload', adminController.getLecturerWorkload);

// Content Management
router.post('/announcements', adminController.createAnnouncement);

// Schedule Management
// router.post('/schedule', adminController.setGlobalSchedule);
router.get('/schedules', adminController.getSchedules);
router.post('/schedules/bulk', adminController.createBulkSchedules);
router.put('/schedules/:id', adminController.updateSchedule);
router.delete('/schedules/:id', adminController.deleteSchedule);

// FAQ Management
router.get('/faqs', adminController.getAllFAQs);
router.get('/faqs/:faqId', adminController.getFAQById);
router.post('/faqs', adminController.createFAQ);
router.put('/faqs/:faqId', adminController.updateFAQ);
router.delete('/faqs/:faqId', adminController.deleteFAQ);

// Enrollment Management
router.get('/enrollments', adminController.getEnrollments);
router.post('/enrollments', adminController.forceEnrollStudent);
router.post('/enrollments/batch', adminController.batchEnrollment);
router.post('/enrollments/import', adminController.importEnrollmentsFromCSV);
router.patch('/enrollments/:enrollmentId', adminController.updateEnrollmentStatus);
router.delete('/enrollments/:enrollmentId', adminController.deleteEnrollment);

// Exam Timetable Routes
router.route('/timetables')
  .get(examTimetableController.getAllExamTimetables)
  .post(examTimetableController.createExamTimetable);

router.route('/timetables/:id')
  .get(examTimetableController.getExamTimetable)
  .put(examTimetableController.updateExamTimetable)
  .delete(examTimetableController.deleteExamTimetable);

router.route('/timetables/:id/sessions')
  .post(examTimetableController.addExamSession);

router.route('/timetables/:id/sessions/:sessionId')
  .put(examTimetableController.updateExamSession)
  .delete(examTimetableController.removeExamSession);

router.route('/timetables/:id/publish')
  .put(examTimetableController.togglePublishStatus);

module.exports = router;