const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Apply auth middleware
router.use(protect);
router.use(authorize('student'));

// Task CRUD operations
router.route('/')
  .get(taskController.getTasks)
  .post(taskController.createTask);

router.route('/:id')
  .get(taskController.getTask)
  .put(taskController.updateTask)
  .delete(taskController.deleteTask);

router.put('/:id/toggle-status', taskController.toggleTaskStatus);

module.exports = router;