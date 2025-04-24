const express = require('express');
const { 
  uploadResource,
  getAllResources,
  getResourceById,
  updateResource,
  deleteResource,
  searchResources,
  getResourcesByCategory,
  downloadResource
} = require('../controllers/resourceController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

const router = express.Router();

// Apply auth middleware to all routes
router.use(protect);

// Upload new resource (requires file upload)
router.post('/', upload.single('file'), uploadResource);

// Get all resources with optional filtering
router.get('/', getAllResources);

// Get resources by category
router.get('/category/:category', getResourcesByCategory);

// Search resources
router.get('/search', searchResources);

// Download resource
router.get('/:id/download', downloadResource);

// Get specific resource
router.get('/:id', getResourceById);

// Update resource details (not the file)
router.put('/:id', updateResource);

// Delete resource
router.delete('/:id', deleteResource);

module.exports = router;