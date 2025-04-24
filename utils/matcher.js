// utils/matcher.js
const Student = require('../models/Student');
const Course = require('../models/Course');

// Match students based on similar courses
exports.findMatchingStudents = async (studentId, limit = 10) => {
  try {
    const student = await Student.findById(studentId).populate('courses');
    
    if (!student) {
      throw new Error('Student not found');
    }

    const studentCourseIds = student.courses.map(course => course._id.toString());
    
    // Find students with similar courses
    const matchingStudents = await Student.find({
      _id: { $ne: studentId }, // Exclude the current student
    }).populate('user', 'fullName avatar').populate('courses');
    
    // Calculate match score for each student based on course overlap
    const scoredMatches = matchingStudents.map(match => {
      const matchCourseIds = match.courses.map(course => course._id.toString());
      
      // Calculate number of shared courses
      const sharedCourses = matchCourseIds.filter(id => 
        studentCourseIds.includes(id)
      );
      
      // Matching score is percentage of shared courses
      const score = (sharedCourses.length / Math.max(1, studentCourseIds.length)) * 100;
      
      return {
        student: match,
        score,
        sharedCourses: sharedCourses.length
      };
    });
    
    // Sort by match score and limit results
    return scoredMatches
      .filter(match => match.score > 0) // Only include students with at least one shared course
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    
  } catch (error) {
    console.error('Error finding matching students:', error);
    throw error;
  }
};

// Recommend study groups based on student interests/courses
exports.recommendStudyGroups = async (studentId, limit = 5) => {
  try {
    const student = await Student.findById(studentId).populate('courses');
    
    if (!student) {
      throw new Error('Student not found');
    }

    const studentCourseIds = student.courses.map(course => course._id.toString());
    
    // Find study groups for the student's courses that they're not already in
    const studyGroups = await StudyGroup.find({
      course: { $in: student.courses },
      members: { $ne: studentId },
      isPublic: true
    }).populate('course', 'name code')
      .populate('creator', 'user')
      .populate('members', 'user')
      .limit(limit);
    
    return studyGroups;
    
  } catch (error) {
    console.error('Error recommending study groups:', error);
    throw error;
  }
};