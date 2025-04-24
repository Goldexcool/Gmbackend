const express = require('express');
const { 
    createPost, 
    getAllPosts, 
    getPostById, 
    deletePost 
} = require('../controllers/postController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Apply auth middleware
router.use(protect);

// Post routes
router.post('/', createPost);
router.get('/', getAllPosts);
router.get('/:id', getPostById);
router.delete('/:id', deletePost);

module.exports = router;