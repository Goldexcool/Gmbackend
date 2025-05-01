const StudyGroup = require('../models/StudyGroup');
const GroupMessage = require('../models/GroupMessage');
const User = require('../models/User');
const Student = require('../models/Student');
const Course = require('../models/Course');
const Department = require('../models/Department');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const ResourceLibrary = require('../models/ResourceLibrary'); // Added for resource sharing

/**
 * @desc    Create a new study group
 * @route   POST /api/study-groups
 * @access  Private
 */
exports.createStudyGroup = async (req, res) => {
  try {
    const { 
      name, 
      description, 
      course, 
      department, 
      isPrivate, 
      tags 
    } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a group name'
      });
    }
    
    // Process tags if provided
    let tagArray = [];
    if (tags) {
      tagArray = tags.split(',').map(tag => tag.trim());
    }
    
    // Process avatar if uploaded
    let avatarPath = 'default-group.png';
    if (req.file) {
      avatarPath = `/uploads/groups/${req.file.filename}`;
    }
    
    // Create new study group
    const studyGroup = await StudyGroup.create({
      name,
      description: description || '',
      course: course || null,
      department: department || null,
      avatar: avatarPath,
      isPrivate: isPrivate === 'true',
      tags: tagArray,
      createdBy: req.user.id,
      members: [{
        user: req.user.id,
        role: 'admin',
        joinedAt: Date.now()
      }]
    });
    
    // Populate creator info for response
    await studyGroup.populate([
      { path: 'createdBy', select: 'fullName avatar' },
      { path: 'course', select: 'code title' },
      { path: 'department', select: 'name code' }
    ]);
    
    res.status(201).json({
      success: true,
      message: 'Study group created successfully',
      data: studyGroup
    });
  } catch (error) {
    console.error('Error creating study group:', error);
    
    // Clean up uploaded file if there was an error
    if (req.file) {
      const filePath = path.join(__dirname, '..', 'public', 'uploads', 'groups', req.file.filename);
      fs.unlink(filePath, err => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating study group',
      error: error.message
    });
  }
};

/**
 * @desc    Get all study groups the user is a member of
 * @route   GET /api/study-groups
 * @access  Private
 */
exports.getMyStudyGroups = async (req, res) => {
  try {
    const { 
      sort = 'lastActivity', 
      order = 'desc', 
      page = 1, 
      limit = 10 
    } = req.query;
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Create sort object
    const sortObj = {};
    sortObj[sort] = order === 'desc' ? -1 : 1;
    
    // Find groups where the user is a member
    const studyGroups = await StudyGroup.find({
      'members.user': req.user.id
    })
      .populate('createdBy', 'fullName avatar')
      .populate('course', 'code title')
      .populate('department', 'name code')
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await StudyGroup.countDocuments({ 'members.user': req.user.id });
    
    // Get unread message counts for each group
    const groupsWithUnreadCounts = await Promise.all(studyGroups.map(async (group) => {
      // Find the last time user read messages in this group
      const lastReadMessage = await GroupMessage.findOne({
        group: group._id,
        'readBy.user': req.user.id
      }).sort({ createdAt: -1 });
      
      const lastReadTime = lastReadMessage 
        ? lastReadMessage.readBy.find(read => read.user.toString() === req.user.id.toString()).readAt
        : new Date(0); // If never read, use epoch time
      
      // Count unread messages
      const unreadCount = await GroupMessage.countDocuments({
        group: group._id,
        sender: { $ne: req.user.id }, // Don't count user's own messages
        createdAt: { $gt: lastReadTime }
      });
      
      // Get current user's role in the group
      const memberInfo = group.members.find(member => 
        member.user.toString() === req.user.id.toString()
      );
      
      // Get total members count
      const membersCount = group.members.length;
      
      return {
        ...group.toObject(),
        unreadMessages: unreadCount,
        userRole: memberInfo ? memberInfo.role : null,
        membersCount
      };
    }));
    
    res.status(200).json({
      success: true,
      count: studyGroups.length,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      },
      data: groupsWithUnreadCounts
    });
  } catch (error) {
    console.error('Error getting user study groups:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting user study groups',
      error: error.message
    });
  }
};

/**
 * @desc    Get available study groups (public groups or related to user's department)
 * @route   GET /api/study-groups/available
 * @access  Private
 */
exports.getAvailableStudyGroups = async (req, res) => {
  try {
    const { 
      sort = 'lastActivity', 
      order = 'desc', 
      page = 1, 
      limit = 10,
      departmentOnly = false 
    } = req.query;
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Create sort object
    const sortObj = {};
    sortObj[sort] = order === 'desc' ? -1 : 1;
    
    // Get user's student info for department filtering
    const student = await Student.findOne({ user: req.user.id });
    
    // Build query
    const query = {
      // Don't show groups the user is already a member of
      'members.user': { $ne: req.user.id },
      // Show only public groups unless filtering by department
      isPrivate: departmentOnly === 'true' ? undefined : false
    };
    
    // Filter by department if requested and student has a department
    if (departmentOnly === 'true' && student && student.department) {
      query.department = student.department;
    }
    
    // Find groups matching criteria
    const studyGroups = await StudyGroup.find(query)
      .populate('createdBy', 'fullName avatar')
      .populate('course', 'code title')
      .populate('department', 'name code')
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await StudyGroup.countDocuments(query);
    
    // Check if user has pending join requests or invitations
    const groupsWithStatus = await Promise.all(studyGroups.map(async (group) => {
      const hasInvitation = group.invitations.some(
        invitation => invitation.user.toString() === req.user.id.toString()
      );
      
      const hasJoinRequest = group.joinRequests.some(
        request => request.user.toString() === req.user.id.toString()
      );
      
      return {
        ...group.toObject(),
        membersCount: group.members.length,
        hasInvitation,
        hasJoinRequest
      };
    }));
    
    res.status(200).json({
      success: true,
      count: studyGroups.length,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      },
      data: groupsWithStatus
    });
  } catch (error) {
    console.error('Error getting available study groups:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting available study groups',
      error: error.message
    });
  }
};

/**
 * @desc    Search for study groups
 * @route   GET /api/study-groups/search
 * @access  Private
 */
exports.searchStudyGroups = async (req, res) => {
  try {
    const { 
      query, 
      department, 
      course,
      includePrivate = false,
      page = 1, 
      limit = 10 
    } = req.query;
    
    if (!query && !department && !course) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one search parameter'
      });
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build search query
    const searchQuery = {};
    
    // Text search if query provided
    if (query) {
      searchQuery.$text = { $search: query };
    }
    
    // Filter by department if provided
    if (department) {
      searchQuery.department = department;
    }
    
    // Filter by course if provided
    if (course) {
      searchQuery.course = course;
    }
    
    // Only include private groups if requested and user is a member
    if (includePrivate !== 'true') {
      searchQuery.$or = [
        { isPrivate: false },
        { 'members.user': req.user.id }
      ];
    }
    
    // Find matching groups
    const studyGroups = await StudyGroup.find(searchQuery)
      .populate('createdBy', 'fullName avatar')
      .populate('course', 'code title')
      .populate('department', 'name code')
      .sort({ score: { $meta: 'textScore' }, lastActivity: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await StudyGroup.countDocuments(searchQuery);
    
    // Add membership status and pending status for each group
    const groupsWithStatus = studyGroups.map(group => {
      const isMember = group.members.some(
        member => member.user.toString() === req.user.id.toString()
      );
      
      const memberInfo = isMember 
        ? group.members.find(member => member.user.toString() === req.user.id.toString())
        : null;
      
      const hasInvitation = group.invitations.some(
        invitation => invitation.user.toString() === req.user.id.toString()
      );
      
      const hasJoinRequest = group.joinRequests.some(
        request => request.user.toString() === req.user.id.toString()
      );
      
      return {
        ...group.toObject(),
        membersCount: group.members.length,
        isMember,
        userRole: memberInfo ? memberInfo.role : null,
        hasInvitation,
        hasJoinRequest
      };
    });
    
    res.status(200).json({
      success: true,
      count: studyGroups.length,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      },
      data: groupsWithStatus
    });
  } catch (error) {
    console.error('Error searching study groups:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching study groups',
      error: error.message
    });
  }
};

/**
 * @desc    Get details of a specific study group
 * @route   GET /api/study-groups/:groupId
 * @access  Private
 */
exports.getStudyGroupDetails = async (req, res) => {
  try {
    const { groupId } = req.params;
    
    // Find the study group
    const studyGroup = await StudyGroup.findById(groupId)
      .populate('createdBy', 'fullName avatar')
      .populate('course', 'code title')
      .populate('department', 'name code')
      .populate('members.user', 'fullName avatar')
      .populate('invitations.user', 'fullName avatar')
      .populate('invitations.invitedBy', 'fullName')
      .populate('joinRequests.user', 'fullName avatar');
    
    if (!studyGroup) {
      return res.status(404).json({
        success: false,
        message: 'Study group not found'
      });
    }
    
    // Check if user is a member of the private group
    if (studyGroup.isPrivate && !studyGroup.isMember(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this private study group'
      });
    }
    
    // Get user's role and status
    const isMember = studyGroup.isMember(req.user.id);
    const memberInfo = isMember
      ? studyGroup.members.find(member => member.user._id.toString() === req.user.id.toString())
      : null;
    
    const hasInvitation = studyGroup.invitations.some(
      invitation => invitation.user._id.toString() === req.user.id.toString()
    );
    
    const hasJoinRequest = studyGroup.joinRequests.some(
      request => request.user._id.toString() === req.user.id.toString()
    );
    
    // Get pinned messages
    const pinnedMessages = await GroupMessage.find({
      group: groupId,
      isPinned: true
    })
      .populate('sender', 'fullName avatar')
      .sort({ createdAt: -1 })
      .limit(5);
    
    // Get message stats
    const totalMessages = await GroupMessage.countDocuments({ group: groupId });
    const messagesByDate = await GroupMessage.aggregate([
      { $match: { group: mongoose.Types.ObjectId(groupId) } },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      { $limit: 14 } // Last 14 days
    ]);
    
    // Format response
    const responseData = {
      ...studyGroup.toObject(),
      isMember,
      userRole: memberInfo ? memberInfo.role : null,
      hasInvitation,
      hasJoinRequest,
      canModerate: isMember ? studyGroup.canModerate(req.user.id) : false,
      stats: {
        totalMessages,
        messagesByDate
      },
      pinnedMessages
    };
    
    res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Error getting study group details:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting study group details',
      error: error.message
    });
  }
};

/**
 * @desc    Update study group details
 * @route   PUT /api/study-groups/:groupId
 * @access  Private (Admin/Moderator)
 */
exports.updateStudyGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { 
      name, 
      description, 
      course, 
      department, 
      isPrivate, 
      tags 
    } = req.body;
    
    // Find the study group
    const studyGroup = await StudyGroup.findById(groupId);
    
    if (!studyGroup) {
      return res.status(404).json({
        success: false,
        message: 'Study group not found'
      });
    }
    
    // Check if user is an admin or moderator
    if (!studyGroup.canModerate(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this study group'
      });
    }
    
    // Process tags if provided
    let tagArray = studyGroup.tags;
    if (tags) {
      tagArray = tags.split(',').map(tag => tag.trim());
    }
    
    // Process avatar if uploaded
    let avatarPath = studyGroup.avatar;
    if (req.file) {
      // Delete old avatar if it's not the default
      if (studyGroup.avatar !== 'default-group.png') {
        const oldAvatarPath = path.join(__dirname, '..', 'public', studyGroup.avatar);
        fs.unlink(oldAvatarPath, err => {
          if (err && err.code !== 'ENOENT') {
            console.error('Error deleting old avatar:', err);
          }
        });
      }
      
      avatarPath = `/uploads/groups/${req.file.filename}`;
    }
    
    // Update study group
    const updatedStudyGroup = await StudyGroup.findByIdAndUpdate(
      groupId,
      {
        name: name || studyGroup.name,
        description: description !== undefined ? description : studyGroup.description,
        course: course || studyGroup.course,
        department: department || studyGroup.department,
        avatar: avatarPath,
        isPrivate: isPrivate !== undefined ? isPrivate === 'true' : studyGroup.isPrivate,
        tags: tagArray
      },
      { new: true }
    )
      .populate('createdBy', 'fullName avatar')
      .populate('course', 'code title')
      .populate('department', 'name code');
    
    res.status(200).json({
      success: true,
      message: 'Study group updated successfully',
      data: updatedStudyGroup
    });
  } catch (error) {
    console.error('Error updating study group:', error);
    
    // Clean up uploaded file if there was an error
    if (req.file) {
      const filePath = path.join(__dirname, '..', 'public', 'uploads', 'groups', req.file.filename);
      fs.unlink(filePath, err => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error updating study group',
      error: error.message
    });
  }
};

/**
 * @desc    Delete a study group
 * @route   DELETE /api/study-groups/:groupId
 * @access  Private (Admin only)
 */
exports.deleteStudyGroup = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { groupId } = req.params;
    
    // Find the study group
    const studyGroup = await StudyGroup.findById(groupId);
    
    if (!studyGroup) {
      return res.status(404).json({
        success: false,
        message: 'Study group not found'
      });
    }
    
    // Check if user is an admin
    if (!studyGroup.isAdmin(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Only group admins can delete the study group'
      });
    }
    
    // Delete all messages in the group
    await GroupMessage.deleteMany({ group: groupId }, { session });
    
    // Delete the study group
    await StudyGroup.findByIdAndDelete(groupId, { session });
    
    // Delete group avatar if it's not the default
    if (studyGroup.avatar !== 'default-group.png') {
      const avatarPath = path.join(__dirname, '..', 'public', studyGroup.avatar);
      fs.unlink(avatarPath, err => {
        if (err && err.code !== 'ENOENT') {
          console.error('Error deleting group avatar:', err);
        }
      });
    }
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(200).json({
      success: true,
      message: 'Study group deleted successfully',
      data: { id: groupId }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error deleting study group:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting study group',
      error: error.message
    });
  }
};

/**
 * @desc    Request to join a study group
 * @route   POST /api/study-groups/:groupId/join
 * @access  Private
 */
exports.requestToJoinGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { message } = req.body;
    
    // Find the study group
    const studyGroup = await StudyGroup.findById(groupId);
    
    if (!studyGroup) {
      return res.status(404).json({
        success: false,
        message: 'Study group not found'
      });
    }
    
    // Check if user is already a member
    if (studyGroup.isMember(req.user.id)) {
      return res.status(400).json({
        success: false,
        message: 'You are already a member of this study group'
      });
    }
    
    // Check if user already has a pending join request
    if (studyGroup.joinRequests.some(request => 
      request.user.toString() === req.user.id.toString()
    )) {
      return res.status(400).json({
        success: false,
        message: 'You already have a pending request to join this group'
      });
    }
    
    // If the group is public, add user directly
    if (!studyGroup.isPrivate) {
      studyGroup.members.push({
        user: req.user.id,
        role: 'member',
        joinedAt: Date.now()
      });
      
      await studyGroup.save();
      
      return res.status(200).json({
        success: true,
        message: 'You have successfully joined the study group',
        data: {
          groupId,
          status: 'joined'
        }
      });
    }
    
    // For private groups, add a join request
    studyGroup.joinRequests.push({
      user: req.user.id,
      requestedAt: Date.now(),
      message: message || 'I would like to join this study group'
    });
    
    await studyGroup.save();
    
    res.status(200).json({
      success: true,
      message: 'Your request to join the study group has been sent',
      data: {
        groupId,
        status: 'requested'
      }
    });
  } catch (error) {
    console.error('Error requesting to join study group:', error);
    res.status(500).json({
      success: false,
      message: 'Error requesting to join study group',
      error: error.message
    });
  }
};

/**
 * @desc    Invite a user to a study group
 * @route   POST /api/study-groups/:groupId/invite/:userId
 * @access  Private (Member)
 */
exports.inviteToGroup = async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    
    // Find the study group
    const studyGroup = await StudyGroup.findById(groupId);
    
    if (!studyGroup) {
      return res.status(404).json({
        success: false,
        message: 'Study group not found'
      });
    }
    
    // Check if the inviter is a member
    if (!studyGroup.isMember(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You must be a member to invite others to the group'
      });
    }
    
    // Check if the invited user exists
    const invitedUser = await User.findById(userId);
    if (!invitedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check if user is already a member
    if (studyGroup.isMember(userId)) {
      return res.status(400).json({
        success: false,
        message: 'User is already a member of this study group'
      });
    }
    
    // Check if user already has an invitation
    if (studyGroup.invitations.some(invitation => 
      invitation.user.toString() === userId.toString()
    )) {
      return res.status(400).json({
        success: false,
        message: 'User has already been invited to this group'
      });
    }
    
    // Add invitation
    studyGroup.invitations.push({
      user: userId,
      invitedBy: req.user.id,
      invitedAt: Date.now()
    });
    
    await studyGroup.save();
    
    // Populate user data for response
    const populatedGroup = await StudyGroup.findById(groupId)
      .populate('invitations.user', 'fullName email avatar')
      .populate('invitations.invitedBy', 'fullName');
    
    // Find the new invitation for response
    const invitation = populatedGroup.invitations.find(
      inv => inv.user._id.toString() === userId.toString()
    );
    
    res.status(200).json({
      success: true,
      message: 'Invitation sent successfully',
      data: invitation
    });
  } catch (error) {
    console.error('Error inviting user to study group:', error);
    res.status(500).json({
      success: false,
      message: 'Error inviting user to study group',
      error: error.message
    });
  }
};

/**
 * @desc    Accept an invitation to join a study group
 * @route   POST /api/study-groups/:groupId/accept-invite
 * @access  Private
 */
exports.acceptGroupInvitation = async (req, res) => {
  try {
    const { groupId } = req.params;
    
    // Find the study group
    const studyGroup = await StudyGroup.findById(groupId);
    
    if (!studyGroup) {
      return res.status(404).json({
        success: false,
        message: 'Study group not found'
      });
    }
    
    // Check if the user has an invitation
    const invitationIndex = studyGroup.invitations.findIndex(
      invitation => invitation.user.toString() === req.user.id.toString()
    );
    
    if (invitationIndex === -1) {
      return res.status(400).json({
        success: false,
        message: 'You do not have an invitation to this group'
      });
    }
    
    // Add user as a member
    studyGroup.members.push({
      user: req.user.id,
      role: 'member',
      joinedAt: Date.now()
    });
    
    // Remove the invitation
    studyGroup.invitations.splice(invitationIndex, 1);
    
    await studyGroup.save();
    
    res.status(200).json({
      success: true,
      message: 'You have successfully joined the study group',
      data: {
        groupId,
        role: 'member'
      }
    });
  } catch (error) {
    console.error('Error accepting group invitation:', error);
    res.status(500).json({
      success: false,
      message: 'Error accepting group invitation',
      error: error.message
    });
  }
};

/**
 * @desc    Decline an invitation to join a study group
 * @route   POST /api/study-groups/:groupId/decline-invite
 * @access  Private
 */
exports.declineGroupInvitation = async (req, res) => {
  try {
    const { groupId } = req.params;
    
    // Find the study group
    const studyGroup = await StudyGroup.findById(groupId);
    
    if (!studyGroup) {
      return res.status(404).json({
        success: false,
        message: 'Study group not found'
      });
    }
    
    // Check if the user has an invitation
    const invitationIndex = studyGroup.invitations.findIndex(
      invitation => invitation.user.toString() === req.user.id.toString()
    );
    
    if (invitationIndex === -1) {
      return res.status(400).json({
        success: false,
        message: 'You do not have an invitation to this group'
      });
    }
    
    // Remove the invitation
    studyGroup.invitations.splice(invitationIndex, 1);
    
    await studyGroup.save();
    
    res.status(200).json({
      success: true,
      message: 'Invitation declined',
      data: {
        groupId
      }
    });
  } catch (error) {
    console.error('Error declining group invitation:', error);
    res.status(500).json({
      success: false,
      message: 'Error declining group invitation',
      error: error.message
    });
  }
};

/**
 * @desc    Approve a user's request to join a study group
 * @route   POST /api/study-groups/:groupId/approve-request/:userId
 * @access  Private (Admin/Moderator)
 */
exports.approveJoinRequest = async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    
    // Find the study group
    const studyGroup = await StudyGroup.findById(groupId);
    
    if (!studyGroup) {
      return res.status(404).json({
        success: false,
        message: 'Study group not found'
      });
    }
    
    // Check if user has permission to approve requests
    if (!studyGroup.canModerate(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to approve join requests'
      });
    }
    
    // Check if the user has a join request
    const requestIndex = studyGroup.joinRequests.findIndex(
      request => request.user.toString() === userId.toString()
    );
    
    if (requestIndex === -1) {
      return res.status(400).json({
        success: false,
        message: 'This user has not requested to join the group'
      });
    }
    
    // Add user as a member
    studyGroup.members.push({
      user: userId,
      role: 'member',
      joinedAt: Date.now()
    });
    
    // Remove the join request
    studyGroup.joinRequests.splice(requestIndex, 1);
    
    await studyGroup.save();
    
    // Populate user data for response
    const user = await User.findById(userId).select('fullName avatar email');
    
    res.status(200).json({
      success: true,
      message: 'Join request approved',
      data: {
        groupId,
        user
      }
    });
  } catch (error) {
    console.error('Error approving join request:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving join request',
      error: error.message
    });
  }
};

/**
 * @desc    Reject a user's request to join a study group
 * @route   POST /api/study-groups/:groupId/reject-request/:userId
 * @access  Private (Admin/Moderator)
 */
exports.rejectJoinRequest = async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    
    // Find the study group
    const studyGroup = await StudyGroup.findById(groupId);
    
    if (!studyGroup) {
      return res.status(404).json({
        success: false,
        message: 'Study group not found'
      });
    }
    
    // Check if user has permission to reject requests
    if (!studyGroup.canModerate(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to reject join requests'
      });
    }
    
    // Check if the user has a join request
    const requestIndex = studyGroup.joinRequests.findIndex(
      request => request.user.toString() === userId.toString()
    );
    
    if (requestIndex === -1) {
      return res.status(400).json({
        success: false,
        message: 'This user has not requested to join the group'
      });
    }
    
    // Remove the join request
    studyGroup.joinRequests.splice(requestIndex, 1);
    
    await studyGroup.save();
    
    res.status(200).json({
      success: true,
      message: 'Join request rejected',
      data: {
        groupId,
        userId
      }
    });
  } catch (error) {
    console.error('Error rejecting join request:', error);
    res.status(500).json({
      success: false,
      message: 'Error rejecting join request',
      error: error.message
    });
  }
};

/**
 * @desc    Update a member's role in a study group
 * @route   PUT /api/study-groups/:groupId/members/:userId/role
 * @access  Private (Admin only)
 */
exports.updateMemberRole = async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    const { role } = req.body;
    
    if (!role || !['admin', 'moderator', 'member'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid role (admin, moderator, or member)'
      });
    }
    
    // Find the study group
    const studyGroup = await StudyGroup.findById(groupId);
    
    if (!studyGroup) {
      return res.status(404).json({
        success: false,
        message: 'Study group not found'
      });
    }
    
    // Check if user is an admin
    if (!studyGroup.isAdmin(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Only group admins can update member roles'
      });
    }
    
    // Check if target user is a member
    const memberIndex = studyGroup.members.findIndex(
      member => member.user.toString() === userId.toString()
    );
    
    if (memberIndex === -1) {
      return res.status(400).json({
        success: false,
        message: 'This user is not a member of the group'
      });
    }
    
    // Ensure there's always at least one admin
    if (
      studyGroup.members[memberIndex].role === 'admin' && 
      role !== 'admin' &&
      studyGroup.members.filter(m => m.role === 'admin').length === 1
    ) {
      return res.status(400).json({
        success: false,
        message: 'Cannot demote the last admin. Promote another member to admin first.'
      });
    }
    
    // Update the role
    studyGroup.members[memberIndex].role = role;
    
    await studyGroup.save();
    
    // Populate user data for response
    const user = await User.findById(userId).select('fullName avatar email');
    
    res.status(200).json({
      success: true,
      message: `Member role updated to ${role}`,
      data: {
        groupId,
        user,
        role
      }
    });
  } catch (error) {
    console.error('Error updating member role:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating member role',
      error: error.message
    });
  }
};

/**
 * @desc    Remove a member from a study group
 * @route   DELETE /api/study-groups/:groupId/members/:userId
 * @access  Private (Admin/Moderator)
 */
exports.removeMember = async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    
    // Find the study group
    const studyGroup = await StudyGroup.findById(groupId);
    
    if (!studyGroup) {
      return res.status(404).json({
        success: false,
        message: 'Study group not found'
      });
    }
    
    // Check if user has permission
    if (!studyGroup.canModerate(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to remove members'
      });
    }
    
    // Cannot remove self (use leave group API)
    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Use the leave group API to remove yourself'
      });
    }
    
    // Check if target user is a member
    const memberIndex = studyGroup.members.findIndex(
      member => member.user.toString() === userId.toString()
    );
    
    if (memberIndex === -1) {
      return res.status(400).json({
        success: false,
        message: 'This user is not a member of the group'
      });
    }
    
    // Moderators cannot remove admins
    const targetMember = studyGroup.members[memberIndex];
    const userMember = studyGroup.members.find(
      member => member.user.toString() === req.user.id.toString()
    );
    
    if (targetMember.role === 'admin' && userMember.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Moderators cannot remove admins'
      });
    }
    
    // Remove the member
    studyGroup.members.splice(memberIndex, 1);
    
    await studyGroup.save();
    
    res.status(200).json({
      success: true,
      message: 'Member removed successfully',
      data: {
        groupId,
        userId
      }
    });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing member',
      error: error.message
    });
  }
};

/**
 * @desc    Leave a study group
 * @route   DELETE /api/study-groups/:groupId/leave
 * @access  Private
 */
exports.leaveGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    
    // Find the study group
    const studyGroup = await StudyGroup.findById(groupId);
    
    if (!studyGroup) {
      return res.status(404).json({
        success: false,
        message: 'Study group not found'
      });
    }
    
    // Check if user is a member
    const memberIndex = studyGroup.members.findIndex(
      member => member.user.toString() === req.user.id.toString()
    );
    
    if (memberIndex === -1) {
      return res.status(400).json({
        success: false,
        message: 'You are not a member of this group'
      });
    }
    
    // Check if user is the last admin
    const isLastAdmin = 
      studyGroup.members[memberIndex].role === 'admin' &&
      studyGroup.members.filter(m => m.role === 'admin').length === 1;
    
    if (isLastAdmin && studyGroup.members.length > 1) {
      return res.status(400).json({
        success: false,
        message: 'You are the last admin. Promote another member to admin before leaving.'
      });
    }
    
    // If user is the last member, delete the group
    if (studyGroup.members.length === 1) {
      await GroupMessage.deleteMany({ group: groupId });
      await StudyGroup.findByIdAndDelete(groupId);
      
      return res.status(200).json({
        success: true,
        message: 'You left the group and it was deleted since you were the last member',
        data: {
          groupId,
          wasDeleted: true
        }
      });
    }
    
    // Remove the member
    studyGroup.members.splice(memberIndex, 1);
    
    await studyGroup.save();
    
    res.status(200).json({
      success: true,
      message: 'You left the group successfully',
      data: {
        groupId,
        wasDeleted: false
      }
    });
  } catch (error) {
    console.error('Error leaving study group:', error);
    res.status(500).json({
      success: false,
      message: 'Error leaving study group',
      error: error.message
    });
  }
};

/**
 * @desc    Get messages for a study group
 * @route   GET /api/study-groups/:groupId/messages
 * @access  Private (Members only)
 */
exports.getGroupMessages = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { 
      page = 1, 
      limit = 30,
      lastMessageId
    } = req.query;
    
    // Find the study group
    const studyGroup = await StudyGroup.findById(groupId);
    
    if (!studyGroup) {
      return res.status(404).json({
        success: false,
        message: 'Study group not found'
      });
    }
    
    // Check if user is a member
    if (!studyGroup.isMember(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You must be a member to view group messages'
      });
    }
    
    // Build query
    let query = { group: groupId };
    
    // If lastMessageId is provided, get messages before that ID
    if (lastMessageId) {
      const lastMessage = await GroupMessage.findById(lastMessageId);
      if (lastMessage) {
        query.createdAt = { $lt: lastMessage.createdAt };
      }
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get messages
    const messages = await GroupMessage.find(query)
      .populate('sender', 'fullName avatar')
      .populate('replyTo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await GroupMessage.countDocuments(query);
    
    // Mark messages as read
    const messageIds = messages.map(message => message._id);
    
    // Only update messages that haven't been read by this user yet
    await Promise.all(messageIds.map(async (messageId) => {
      await GroupMessage.updateOne(
        { 
          _id: messageId,
          'readBy.user': { $ne: req.user.id }
        },
        {
          $addToSet: {
            readBy: {
              user: req.user.id,
              readAt: Date.now()
            }
          }
        }
      );
    }));
    
    res.status(200).json({
      success: true,
      count: messages.length,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        hasMore: messages.length === parseInt(limit)
      },
      data: messages.reverse() // Return in chronological order
    });
  } catch (error) {
    console.error('Error getting group messages:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting group messages',
      error: error.message
    });
  }
};

/**
 * @desc    Send a message to a study group
 * @route   POST /api/study-groups/:groupId/messages
 * @access  Private (Members only)
 */
exports.sendGroupMessage = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { text, replyTo, isAnnouncement } = req.body;
    
    // Find the study group
    const studyGroup = await StudyGroup.findById(groupId);
    
    if (!studyGroup) {
      return res.status(404).json({
        success: false,
        message: 'Study group not found'
      });
    }
    
    // Check if user is a member
    if (!studyGroup.isMember(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You must be a member to send messages to the group'
      });
    }
    
    // Check if text or attachments are provided
    if (!text && (!req.files || req.files.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide text or attachments'
      });
    }
    
    // Check if user can make announcements
    if (isAnnouncement && !studyGroup.canModerate(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Only admins and moderators can make announcements'
      });
    }
    
    // Process attachments if any
    const attachments = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        // Determine file type
        const mimeType = file.mimetype;
        const isImage = mimeType.startsWith('image/');
        const isVideo = mimeType.startsWith('video/');
        const isDocument = !isImage && !isVideo;
        
        attachments.push({
          url: `/uploads/groups/messages/${file.filename}`,
          filename: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          isImage,
          isVideo,
          isDocument
        });
      });
    }
    
    // Create message
    const message = await GroupMessage.create({
      group: groupId,
      sender: req.user.id,
      text: text || '',
      attachments,
      replyTo: replyTo || null,
      isAnnouncement: isAnnouncement === 'true' && studyGroup.canModerate(req.user.id),
      readBy: [{
        user: req.user.id,
        readAt: Date.now()
      }]
    });
    
    // Populate sender and reply info
    await message.populate([
      { path: 'sender', select: 'fullName avatar' },
      { path: 'replyTo' }
    ]);
    
    // Update group's lastActivity
    studyGroup.lastActivity = Date.now();
    await studyGroup.save();
    
    res.status(201).json({
      success: true,
      data: message
    });
  } catch (error) {
    console.error('Error sending group message:', error);
    
    // Clean up uploaded files if there was an error
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        const filePath = path.join(__dirname, '..', 'public', 'uploads', 'groups', 'messages', file.filename);
        fs.unlink(filePath, err => {
          if (err) console.error('Error deleting file:', err);
        });
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error sending group message',
      error: error.message
    });
  }
};

/**
 * @desc    Edit a group message
 * @route   PUT /api/study-groups/:groupId/messages/:messageId
 * @access  Private (Sender or Admin/Moderator)
 */
exports.editGroupMessage = async (req, res) => {
  try {
    const { groupId, messageId } = req.params;
    const { text } = req.body;
    
    if (!text || text.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Please provide text for the message'
      });
    }
    
    // Find the study group
    const studyGroup = await StudyGroup.findById(groupId);
    
    if (!studyGroup) {
      return res.status(404).json({
        success: false,
        message: 'Study group not found'
      });
    }
    
    // Check if user is a member
    if (!studyGroup.isMember(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You must be a member to edit messages in the group'
      });
    }
    
    // Find the message
    const message = await GroupMessage.findById(messageId);
    
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }
    
    // Check if user is the sender or has moderation rights
    if (
      message.sender.toString() !== req.user.id.toString() &&
      !studyGroup.canModerate(req.user.id)
    ) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own messages'
      });
    }
    
    // Add the original text to edit history
    if (!message.editHistory) {
      message.editHistory = [];
    }
    
    message.editHistory.push({
      text: message.text,
      editedAt: Date.now()
    });
    
    // Update the message
    message.text = text;
    message.edited = true;
    
    await message.save();
    
    // Populate sender info for response
    await message.populate('sender', 'fullName avatar');
    
    res.status(200).json({
      success: true,
      message: 'Message edited successfully',
      data: message
    });
  } catch (error) {
    console.error('Error editing group message:', error);
    res.status(500).json({
      success: false,
      message: 'Error editing group message',
      error: error.message
    });
  }
};

/**
 * @desc    Delete a group message
 * @route   DELETE /api/study-groups/:groupId/messages/:messageId
 * @access  Private (Sender or Admin/Moderator)
 */
exports.deleteGroupMessage = async (req, res) => {
  try {
    const { groupId, messageId } = req.params;
    
    // Find the study group
    const studyGroup = await StudyGroup.findById(groupId);
    
    if (!studyGroup) {
      return res.status(404).json({
        success: false,
        message: 'Study group not found'
      });
    }
    
    // Check if user is a member
    if (!studyGroup.isMember(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You must be a member to delete messages in the group'
      });
    }
    
    // Find the message
    const message = await GroupMessage.findById(messageId);
    
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }
    
    // Check if user is the sender or has moderation rights
    if (
      message.sender.toString() !== req.user.id.toString() &&
      !studyGroup.canModerate(req.user.id)
    ) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own messages'
      });
    }
    
    // Delete attachments if any
    if (message.attachments && message.attachments.length > 0) {
      message.attachments.forEach(attachment => {
        const filePath = path.join(__dirname, '..', 'public', attachment.url);
        fs.unlink(filePath, err => {
          if (err && err.code !== 'ENOENT') {
            console.error('Error deleting attachment:', err);
          }
        });
      });
    }
    
    // Delete the message
    await GroupMessage.findByIdAndDelete(messageId);
    
    res.status(200).json({
      success: true,
      message: 'Message deleted successfully',
      data: { id: messageId }
    });
  } catch (error) {
    console.error('Error deleting group message:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting group message',
      error: error.message
    });
  }
};

/**
 * @desc    Pin a group message
 * @route   POST /api/study-groups/:groupId/messages/:messageId/pin
 * @access  Private (Admin/Moderator)
 */
exports.pinGroupMessage = async (req, res) => {
  try {
    const { groupId, messageId } = req.params;
    
    // Find the study group
    const studyGroup = await StudyGroup.findById(groupId);
    
    if (!studyGroup) {
      return res.status(404).json({
        success: false,
        message: 'Study group not found'
      });
    }
    
    // Check if user has permission to pin messages
    if (!studyGroup.canModerate(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Only admins and moderators can pin messages'
      });
    }
    
    // Find the message
    const message = await GroupMessage.findById(messageId);
    
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }
    
    // Update message pin status
    message.isPinned = true;
    await message.save();
    
    // Populate sender info for response
    await message.populate('sender', 'fullName avatar');
    
    res.status(200).json({
      success: true,
      message: 'Message pinned successfully',
      data: message
    });
  } catch (error) {
    console.error('Error pinning group message:', error);
    res.status(500).json({
      success: false,
      message: 'Error pinning group message',
      error: error.message
    });
  }
};

/**
 * @desc    Unpin a group message
 * @route   POST /api/study-groups/:groupId/messages/:messageId/unpin
 * @access  Private (Admin/Moderator)
 */
exports.unpinGroupMessage = async (req, res) => {
  try {
    const { groupId, messageId } = req.params;
    
    // Find the study group
    const studyGroup = await StudyGroup.findById(groupId);
    
    if (!studyGroup) {
      return res.status(404).json({
        success: false,
        message: 'Study group not found'
      });
    }
    
    // Check if user has permission to unpin messages
    if (!studyGroup.canModerate(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Only admins and moderators can unpin messages'
      });
    }
    
    // Find the message
    const message = await GroupMessage.findById(messageId);
    
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }
    
    // Update message pin status
    message.isPinned = false;
    await message.save();
    
    // Populate sender info for response
    await message.populate('sender', 'fullName avatar');
    
    res.status(200).json({
      success: true,
      message: 'Message unpinned successfully',
      data: message
    });
  } catch (error) {
    console.error('Error unpinning group message:', error);
    res.status(500).json({
      success: false,
      message: 'Error unpinning group message',
      error: error.message
    });
  }
};

/**
 * @desc    Share resource in group chat
 * @route   POST /api/study-groups/:groupId/share-resource
 * @access  Private
 */
exports.shareResource = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { resourceId, message } = req.body;
    
    if (!resourceId) {
      return res.status(400).json({
        success: false,
        message: 'Resource ID is required'
      });
    }
    
    // Find the study group
    const studyGroup = await StudyGroup.findById(groupId);
    
    if (!studyGroup) {
      return res.status(404).json({
        success: false,
        message: 'Study group not found'
      });
    }
    
    // Check if user is a member
    if (!studyGroup.isMember(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You must be a member to share resources in the group'
      });
    }
    
    // Find the resource
    const resource = await ResourceLibrary.findById(resourceId);
    
    if (!resource) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found'
      });
    }
    
    // Determine resource type
    const isImage = resource.format && ['jpg', 'jpeg', 'png', 'gif'].includes(resource.format);
    const isVideo = resource.format && ['mp4', 'webm', 'ogg'].includes(resource.format);
    const isDocument = !isImage && !isVideo;
    
    // Create message with resource attachment
    const newMessage = await GroupMessage.create({
      group: groupId,
      sender: req.user.id,
      text: message || `Shared resource: ${resource.title}`,
      attachments: [{
        resourceId: resource._id,
        title: resource.title,
        type: resource.resourceType,
        url: resource.fileUrl || resource.externalLink,
        isImage,
        isVideo,
        isDocument
      }]
    });
    
    // Update resource share count
    await ResourceLibrary.findByIdAndUpdate(
      resourceId,
      { $inc: { shares: 1 } }
    );
    
    // Update group's last activity
    studyGroup.lastActivity = Date.now();
    studyGroup.lastMessage = {
      text: newMessage.text,
      sender: req.user.id,
      timestamp: new Date()
    };
    
    await studyGroup.save();
    
    // Populate sender info
    await newMessage.populate('sender', 'fullName avatar');
    
    res.status(200).json({
      success: true,
      message: 'Resource shared successfully',
      data: newMessage
    });
  } catch (error) {
    console.error('Error sharing resource:', error);
    res.status(500).json({
      success: false,
      message: 'Error sharing resource',
      error: error.message
    });
  }
};