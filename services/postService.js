const Post = require('../models/Post');

exports.createPost = async (postData) => {
  try {
    const post = new Post(postData);
    await post.save();
    return post;
  } catch (error) {
    throw new Error('Error creating post: ' + error.message);
  }
};

exports.getPostById = async (postId) => {
  try {
    const post = await Post.findById(postId);
    if (!post) {
      throw new Error('Post not found');
    }
    return post;
  } catch (error) {
    throw new Error('Error fetching post: ' + error.message);
  }
};

exports.getAllPosts = async () => {
  try {
    const posts = await Post.find().populate('author', 'username');
    return posts;
  } catch (error) {
    throw new Error('Error fetching posts: ' + error.message);
  }
};

exports.updatePost = async (postId, updateData) => {
  try {
    const post = await Post.findByIdAndUpdate(postId, updateData, { new: true });
    if (!post) {
      throw new Error('Post not found');
    }
    return post;
  } catch (error) {
    throw new Error('Error updating post: ' + error.message);
  }
};

exports.deletePost = async (postId) => {
  try {
    const post = await Post.findByIdAndDelete(postId);
    if (!post) {
      throw new Error('Post not found');
    }
    return post;
  } catch (error) {
    throw new Error('Error deleting post: ' + error.message);
  }
};