const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

// Apply authentication middleware to all admin routes
router.use(protect);
router.use(authorize('admin'));

// Course management
router.post('/courses', adminController.createCourse);
router.post('/courses/bulk', adminController.createCoursesBulk);
router.get('/courses/department/:departmentName', adminController.getCoursesByDepartment);
router.put('/courses/:id', adminController.updateCourse);
router.delete('/courses/:id', adminController.deleteCourse);
router.patch('/courses/batch', adminController.batchUpdateCourses);

// Lecturer management
router.get('/lecturers/department/:departmentName', adminController.getLecturersByDepartment);
router.post('/assign-course', adminController.assignCourse);
router.post('/assign-courses', adminController.assignMultipleCourses);
router.delete('/courses/:courseId/lecturers/:lecturerId', adminController.removeLecturerFromCourse);
router.put('/courses/:courseId/lecturers', adminController.updateCourseLecturers);

// Department setup
// router.post('/department-setup', adminController.setupDepartment);

// Department Management
router.get('/departments', adminController.getDepartments);
router.get('/departments/:departmentName', adminController.getDepartmentDetails);
router.put('/departments/:departmentName', adminController.updateDepartment);
router.delete('/departments/:departmentName', adminController.deleteDepartment);

// User management
router.post('/users', adminController.createUser);
router.post('/users/bulk', adminController.createUsersBulk);
router.patch('/users/:userId/status', adminController.toggleUserStatus);
router.patch('/users/:userId/role', adminController.changeUserRole);
router.post('/users/:userId/reset-password', adminController.resetUserPassword);
router.delete('/users/:userId', adminController.deleteUser);

// Reports & Analytics
router.get('/reports/enrollments', adminController.getEnrollmentStats);
router.get('/reports/lecturer-workload', adminController.getLecturerWorkload);

// Content Management
router.post('/announcements', adminController.createAnnouncement);

// Schedule Management
router.post('/schedule', adminController.setGlobalSchedule);
router.get('/schedules', adminController.getSchedules);
router.post('/schedules/bulk', adminController.createBulkSchedules);
router.put('/schedules/:id', adminController.updateSchedule);
router.delete('/schedules/:id', adminController.deleteSchedule);
router.delete('/schedules/course/:courseId', adminController.deleteCoursesSchedules);

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

// Dashboard
router.get('/dashboard', adminController.getAdminDashboard);

module.exports = router;