/**
 * Format department information to include ID and name
 * @param {Object|String} department - Department object or ID
 * @returns {Object} Formatted department info
 */
exports.formatDepartmentInfo = async (department) => {
  // If it's already a populated object
  if (department && typeof department === 'object' && department.name) {
    return {
      id: department._id,
      name: department.name,
      code: department.code,
      faculty: department.faculty
    };
  }
  
  // If it's just an ID
  if (department) {
    try {
      const Department = require('../models/Department');
      const departmentDoc = await Department.findById(department).select('name code faculty');
      if (departmentDoc) {
        return {
          id: departmentDoc._id,
          name: departmentDoc.name,
          code: departmentDoc.code,
          faculty: departmentDoc.faculty
        };
      }
    } catch (err) {
      console.warn('Could not format department info', err);
    }
  }
  
  // Return original if we can't format it
  return department;
};