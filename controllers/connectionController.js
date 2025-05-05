const User = require('../models/User');
const Student = require('../models/Student');
const Connection = require('../models/Connection');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Department = require('../models/Department');
const mongoose = require('mongoose');

const conversationSchema = mongoose.model('Conversation').schema;
console.log('Conversation Schema Fields:', Object.keys(conversationSchema.paths));

/**
 * @desc    Get connection suggestions for the user
 * @route   GET /api/connections/suggestions
 * @access  Private
 */
exports.getConnectionSuggestions = async (req, res) => {
  try {
    // Get current user's student profile
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found'
      });
    }

    // Find the student profile for the current user
    const student = await Student.findOne({ user: req.user.id });
    
    // Initialize query to find all students except the current user
    let query = {
      user: { $ne: req.user.id },
      // Avoid suggesting users who already have a connection with the current user
      _id: { $nin: [] }
    };
    
    // Find all existing connections
    const existingConnections = await Connection.find({
      $or: [
        { requester: req.user.id },
        { recipient: req.user.id }
      ]
    });
    
    // Get IDs of all users the current user is already connected with
    const connectedUserIds = existingConnections.map(conn => {
      return conn.requester.toString() === req.user.id 
        ? conn.recipient 
        : conn.requester;
    });
    
    // Exclude users who already have connections
    if (connectedUserIds.length > 0) {
      query.user = { 
        $ne: req.user.id,
        $nin: connectedUserIds 
      };
    }
    
    // Prioritize suggestions based on various factors
    let suggestions = [];
    
    // First, try to find students in the same department if student record exists
    if (student && student.department) {
      const departmentStudents = await Student.find({
        ...query,
        department: student.department
      })
      .populate('user', 'fullName email profileImage')
      .populate('department', 'name')
      .limit(5);
      
      suggestions.push(...departmentStudents);
    }
    
    // If we need more suggestions, find students in the same courses
    if (student && suggestions.length < 10 && student.courses && student.courses.length > 0) {
      const courseStudents = await Student.find({
        ...query,
        courses: { $in: student.courses },
        _id: { $nin: suggestions.map(s => s._id) }  // Exclude already suggested students
      })
      .populate('user', 'fullName email profileImage')
      .populate('department', 'name')
      .limit(10 - suggestions.length);
      
      suggestions.push(...courseStudents);
    }
    
    // If we still need more, get general suggestions
    if (suggestions.length < 10) {
      const generalStudents = await Student.find({
        ...query,
        _id: { $nin: suggestions.map(s => s._id) }  // Exclude already suggested students
      })
      .populate('user', 'fullName email profileImage')
      .populate('department', 'name')
      .limit(10 - suggestions.length);
      
      suggestions.push(...generalStudents);
    }
    
    // Format suggestions for the response
    const formattedSuggestions = suggestions.map(student => {
      return {
        id: student._id,
        user: student.user,
        matricNumber: student.matricNumber,
        department: student.department,
        level: student.level,
        connectionReason: student.department && student.department._id.equals(student.department) 
          ? 'Same department' 
          : 'May know each other'
      };
    });
    
    res.status(200).json({
      success: true,
      count: formattedSuggestions.length,
      data: formattedSuggestions
    });
  } catch (error) {
    console.error('Error getting connection suggestions:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting connection suggestions',
      error: error.message
    });
  }
};

/**
 * @desc    Get pending connection requests for the user
 * @route   GET /api/connections/requests
 * @access  Private
 */
exports.getConnectionRequests = async (req, res) => {
  try {
    // Find pending connection requests where current user is the recipient
    const pendingRequests = await Connection.find({
      recipient: req.user.id,
      status: 'pending'
    })
      .populate({
        path: 'requester',
        select: 'fullName email avatar'
      })
      .sort({ requestDate: -1 });
    
    // Find pending connection requests where current user is the requester
    const sentRequests = await Connection.find({
      requester: req.user.id,
      status: 'pending'
    })
      .populate({
        path: 'recipient',
        select: 'fullName email avatar'
      })
      .sort({ requestDate: -1 });
    
    res.status(200).json({
      success: true,
      data: {
        received: pendingRequests,
        sent: sentRequests
      }
    });
  } catch (error) {
    console.error('Error getting connection requests:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting connection requests',
      error: error.message
    });
  }
};

/**
 * @desc    Get all connections for the user
 * @route   GET /api/connections/my-connections
 * @access  Private
 */
exports.getMyConnections = async (req, res) => {
  try {
    // Find all accepted connections where current user is either requester or recipient
    const connections = await Connection.find({
      $or: [
        { requester: req.user.id, status: 'accepted' },
        { recipient: req.user.id, status: 'accepted' }
      ]
    })
      .populate({
        path: 'requester',
        select: 'fullName email avatar'
      })
      .populate({
        path: 'recipient',
        select: 'fullName email avatar'
      })
      .populate('conversation')
      .sort({ responseDate: -1 });
    
    // Format connections to show the other person in each connection
    const formattedConnections = connections.map(connection => {
      const isRequester = connection.requester._id.toString() === req.user.id.toString();
      const otherUser = isRequester ? connection.recipient : connection.requester;
      
      return {
        _id: connection._id,
        user: {
          _id: otherUser._id,
          fullName: otherUser.fullName,
          email: otherUser.email,
          avatar: otherUser.avatar
        },
        connectedSince: connection.responseDate,
        lastInteraction: connection.lastInteraction,
        conversationId: connection.conversation ? connection.conversation._id : null
      };
    });
    
    res.status(200).json({
      success: true,
      count: formattedConnections.length,
      data: formattedConnections
    });
  } catch (error) {
    console.error('Error getting user connections:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting user connections',
      error: error.message
    });
  }
};

/**
 * @desc    Send a connection request to another user
 * @route   POST /api/connections/request/:userId
 * @access  Private
 */
exports.sendConnectionRequest = async (req, res) => {
  try {
    const { userId } = req.params;
    const { message } = req.body;
    
    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }
    
    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot send a connection request to yourself'
      });
    }
    
    // Check if user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check if connection already exists
    const existingConnection = await Connection.findOne({
      $or: [
        { requester: req.user.id, recipient: userId },
        { requester: userId, recipient: req.user.id }
      ]
    });
    
    if (existingConnection) {
      return res.status(400).json({
        success: false,
        message: 'Connection request already exists or you are already connected'
      });
    }
    
    // Create connection request
    const connection = new Connection({
      requester: req.user.id,
      recipient: userId,
      status: 'pending',
      message: message || ''
    });
    
    await connection.save();
    
    // Notify the recipient about the connection request
    // (code for notification would go here)
    
    res.status(201).json({
      success: true,
      message: 'Connection request sent successfully',
      data: connection
    });
  } catch (error) {
    console.error('Error sending connection request:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending connection request',
      error: error.message
    });
  }
};

/**
 * @desc    Accept a connection request
 * @route   PUT /api/connections/accept/:connectionId
 * @access  Private
 */
exports.acceptConnectionRequest = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { connectionId } = req.params;
    
    // Find the connection request
    const connection = await Connection.findById(connectionId).session(session);
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'Connection request not found'
      });
    }
    
    // Check if user is the recipient of the request
    if (connection.recipient.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to accept this connection request'
      });
    }
    
    // Check if the connection is already accepted
    if (connection.status === 'accepted') {
      return res.status(400).json({
        success: false,
        message: 'This connection request is already accepted'
      });
    }
    
    // Update connection status
    connection.status = 'accepted';
    connection.responseDate = Date.now();
    connection.lastInteraction = Date.now();
    await connection.save({ session });
    
    // Remove from connection requests
    await User.findByIdAndUpdate(
      req.user.id,
      { $pull: { connectionRequests: { user: connection.requester } } },
      { session }
    );
    
    // Update connection counts for both users
    await User.findByIdAndUpdate(
      connection.requester,
      { $inc: { connectionCount: 1 } },
      { session }
    );
    
    await User.findByIdAndUpdate(
      connection.recipient,
      { $inc: { connectionCount: 1 } },
      { session }
    );
    
    // Create a conversation for the connection
    const conversation = await Conversation.create([{
      connection: connection._id,
      participants: [connection.requester, connection.recipient],
      isActive: true
    }], { session });
    
    await session.commitTransaction();
    session.endSession();
    
    // Populate user data for response
    await connection.populate([
      { path: 'requester', select: 'fullName email avatar' },
      { path: 'recipient', select: 'fullName email avatar' }
    ]);
    
    res.status(200).json({
      success: true,
      message: 'Connection request accepted successfully',
      data: {
        connection,
        conversation: conversation[0]
      }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error accepting connection request:', error);
    res.status(500).json({
      success: false,
      message: 'Error accepting connection request',
      error: error.message
    });
  }
};

/**
 * @desc    Reject a connection request
 * @route   PUT /api/connections/reject/:connectionId
 * @access  Private
 */
exports.rejectConnectionRequest = async (req, res) => {
  try {
    const { connectionId } = req.params;
    
    // Find the connection request
    const connection = await Connection.findById(connectionId);
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'Connection request not found'
      });
    }
    
    // Check if user is the recipient of the request
    if (connection.recipient.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to reject this connection request'
      });
    }
    
    // Update connection status
    connection.status = 'rejected';
    connection.responseDate = Date.now();
    await connection.save();
    
    // Remove from connection requests
    await User.findByIdAndUpdate(
      req.user.id,
      { $pull: { connectionRequests: { user: connection.requester } } }
    );
    
    res.status(200).json({
      success: true,
      message: 'Connection request rejected successfully',
      data: { id: connectionId }
    });
  } catch (error) {
    console.error('Error rejecting connection request:', error);
    res.status(500).json({
      success: false,
      message: 'Error rejecting connection request',
      error: error.message
    });
  }
};

/**
 * @desc    Remove an existing connection
 * @route   DELETE /api/connections/:connectionId
 * @access  Private
 */
exports.removeConnection = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { connectionId } = req.params;
    
    // Find the connection
    const connection = await Connection.findById(connectionId).session(session);
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'Connection not found'
      });
    }
    
    // Check if user is part of the connection
    if (connection.requester.toString() !== req.user.id && 
        connection.recipient.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to remove this connection'
      });
    }
    
    // Check if the connection is accepted (can only remove accepted connections)
    if (connection.status !== 'accepted') {
      return res.status(400).json({
        success: false,
        message: 'Can only remove accepted connections'
      });
    }
    
    // Get the conversation for this connection
    const conversation = await Conversation.findOne({ 
      connection: connectionId 
    }).session(session);
    
    // Delete all messages if conversation exists
    if (conversation) {
      await Message.deleteMany({ 
        conversation: conversation._id 
      }, { session });
      
      // Delete the conversation
      await Conversation.findByIdAndDelete(conversation._id, { session });
    }
    
    // Decrement connection counts for both users
    await User.findByIdAndUpdate(
      connection.requester,
      { $inc: { connectionCount: -1 } },
      { session }
    );
    
    await User.findByIdAndUpdate(
      connection.recipient,
      { $inc: { connectionCount: -1 } },
      { session }
    );
    
    // Delete the connection
    await Connection.findByIdAndDelete(connectionId, { session });
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(200).json({
      success: true,
      message: 'Connection removed successfully',
      data: { id: connectionId }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error removing connection:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing connection',
      error: error.message
    });
  }
};

/**
 * @desc    Get my conversations
 * @route   GET /api/connections/conversations
 * @access  Private
 */
exports.getMyConversations = async (req, res) => {
  try {
    // Make sure the user exists
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check what fields are available in the Conversation schema
    const schemaFields = Object.keys(conversationSchema.paths);
    console.log('Available fields in Conversation schema:', schemaFields);

    // Determine the correct field name for participants
    let participantsField = 'participants';
    if (!schemaFields.includes('participants')) {
      // Look for alternatives like 'users', 'members', etc.
      const possibleFields = ['users', 'members', 'people', 'user_ids'];
      for (const field of possibleFields) {
        if (schemaFields.includes(field)) {
          participantsField = field;
          console.log(`Using ${field} instead of participants`);
          break;
        }
      }
    }

    const query = {};
    query[participantsField] = req.user.id;

    const populateOptions = [];
    
    if (schemaFields.includes(participantsField)) {
      populateOptions.push({
        path: participantsField,
        select: 'fullName email profileImage avatar',
        match: { _id: { $ne: req.user.id } },
        strictPopulate: false
      });
    }
    
    if (schemaFields.includes('lastMessage')) {
      populateOptions.push({
        path: 'lastMessage',
        strictPopulate: false
      });
    }
    
    if (schemaFields.includes('connection')) {
      populateOptions.push({
        path: 'connection',
        strictPopulate: false
      });
    }

    const conversations = await Conversation.find(query)
      .populate(populateOptions)
      .sort({ updatedAt: -1 });
    
    const formattedConversations = conversations.map(conversation => {
      let otherParticipant = null;
      if (conversation[participantsField] && Array.isArray(conversation[participantsField])) {
        const participants = conversation[participantsField].filter(p => p && p._id);
        otherParticipant = participants.length > 0 ? participants[0] : null;
      }
      
      return {
        id: conversation._id,
        otherUser: otherParticipant,
        lastMessage: conversation.lastMessage,
        updatedAt: conversation.updatedAt,
        unreadCount: 0, 
        connection: conversation.connection
      };
    });
    
    res.status(200).json({
      success: true,
      count: formattedConversations.length,
      data: formattedConversations
    });
  } catch (error) {
    console.error('Error getting conversations:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting conversations',
      error: error.message
    });
  }
};

// @desc    Get messages for a conversation
// @route   GET /api/connections/conversations/:conversationId/messages
// @access  Private
exports.getConversationMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    // Find conversation
    const conversation = await Conversation.findById(conversationId);
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }
    
    // Check if user is a participant in the conversation
    if (!conversation.participants || !conversation.participants.includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to access this conversation'
      });
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get messages with pagination (newest first)
    const messages = await Message.find({
      conversation: conversationId
    })
      .populate('sender', 'fullName avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Automatically mark unread messages as read if sent by other user
    const unreadMessagesIds = messages
      .filter(msg => !msg.read && msg.sender._id.toString() !== req.user.id)
      .map(msg => msg._id);
    
    if (unreadMessagesIds.length > 0) {
      await Message.updateMany(
        { _id: { $in: unreadMessagesIds } },
        { 
          read: true,
          readAt: Date.now()
        }
      );
      
      // If the last message was unread, update conversation's lastMessage.read
      if (conversation.lastMessage && 
          conversation.lastMessage.sender && 
          conversation.lastMessage.sender.toString() !== req.user.id && 
          !conversation.lastMessage.read) {
        conversation.lastMessage.read = true;
        await conversation.save();
      }
    }
    
    // Get total count for pagination
    const total = await Message.countDocuments({ conversation: conversationId });
    
    // Get the other participant
    const otherParticipant = conversation.participants && conversation.participants.find(
      p => p.toString() !== req.user.id
    );
    
    // Get other participant's details if available
    let participantInfo = null;
    if (otherParticipant) {
      participantInfo = await User.findById(otherParticipant)
        .select('fullName email profileImage');
    }
    
    res.status(200).json({
      success: true,
      count: messages.length,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      },
      data: {
        messages,
        otherParticipant: participantInfo
      }
    });
  } catch (error) {
    console.error('Error getting conversation messages:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting conversation messages',
      error: error.message
    });
  }
};

/**
 * @desc    Send a message in a conversation
 * @route   POST /api/connections/conversations/:conversationId/messages
 * @access  Private
 */
exports.sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { text } = req.body;
    
    // Validate message text
    if (!text || text.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Message text is required'
      });
    }
    
    // Find conversation
    const conversation = await Conversation.findById(conversationId);
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }
    
    // Check if user is a participant in the conversation
    if (!conversation.participants.includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to send messages in this conversation'
      });
    }
    
    // Handle file attachments if any
    const attachments = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        attachments.push({
          url: `/uploads/messages/${file.filename}`,
          mimeType: file.mimetype,
          filename: file.originalname
        });
      });
    }
    
    // Create the message
    const message = await Message.create({
      conversation: conversationId,
      sender: req.user.id,
      text,
      attachments,
      read: false
    });
    
    // Update connection's lastInteraction
    const connection = await Connection.findById(conversation.connection);
    if (connection) {
      connection.lastInteraction = Date.now();
      await connection.save();
    }
    
    // Populate sender info for response
    await message.populate('sender', 'fullName avatar');
    
    res.status(201).json({
      success: true,
      data: message
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending message',
      error: error.message
    });
  }
};

/**
 * @desc    Mark a message as read
 * @route   PUT /api/connections/messages/:messageId/read
 * @access  Private
 */
exports.markMessageAsRead = async (req, res) => {
  try {
    const { messageId } = req.params;
    
    // Find the message
    const message = await Message.findById(messageId)
      .populate('conversation');
    
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }
    
    // Check if user is a participant in the conversation
    const conversation = await Conversation.findById(message.conversation);
    if (!conversation.participants.includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to mark this message as read'
      });
    }
    
    // Only mark as read if user is recipient (not sender)
    if (message.sender.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot mark your own message as read'
      });
    }
    
    // Mark message as read
    message.read = true;
    message.readAt = Date.now();
    await message.save();
    
    // Update conversation's lastMessage if this is the last message
    if (conversation.lastMessage && 
        conversation.lastMessage.sender.toString() === message.sender.toString() && 
        !conversation.lastMessage.read) {
      conversation.lastMessage.read = true;
      await conversation.save();
    }
    
    res.status(200).json({
      success: true,
      data: { id: messageId, read: true, readAt: message.readAt }
    });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking message as read',
      error: error.message
    });
  }
};

/**
 * @desc    Advanced search for students by name or matriculation number
 * @route   GET /api/connections/search
 * @access  Private
 */
exports.searchStudents = async (req, res) => {
  try {
    const { query, type, department, level, page = 1, limit = 20 } = req.query;
    
    if (!query || query.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }
    
    // Get current user's student information
    const currentUserStudent = await Student.findOne({ user: req.user.id });
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build the search pipeline
    const searchPipeline = [];
    
    // First stage: Match either by matricNumber or lookup user by name
    if (type === 'matricNumber') {
      // Exact match for matric number
      searchPipeline.push({
        $match: {
          matricNumber: { $regex: new RegExp(`^${query}$`, 'i') }
        }
      });
    } else {
      // Use lookup to join with users collection for name search
      searchPipeline.push(
        {
          $lookup: {
            from: 'users',
            localField: 'user',
            foreignField: '_id',
            as: 'userInfo'
          }
        },
        {
          $unwind: '$userInfo'
        },
        {
          $match: {
            'userInfo.fullName': { $regex: query, $options: 'i' }
          }
        }
      );
    }
    
    // Filter by department if provided
    if (department) {
      searchPipeline.push({
        $match: { department: mongoose.Types.ObjectId(department) }
      });
    }
    
    // Filter by level if provided
    if (level) {
      searchPipeline.push({
        $match: { level: parseInt(level) }
      });
    }
    
    // Exclude current user
    searchPipeline.push({
      $match: {
        user: { $ne: mongoose.Types.ObjectId(req.user.id) }
      }
    });
    
    // Add lookup for department
    searchPipeline.push({
      $lookup: {
        from: 'departments',
        localField: 'department',
        foreignField: '_id',
        as: 'departmentInfo'
      }
    });
    
    // Add lookup for user details if not already done
    if (type === 'matricNumber') {
      searchPipeline.push({
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'userInfo'
        }
      });
      
      searchPipeline.push({
        $unwind: '$userInfo'
      });
    }
    
    // Count total results (for pagination)
    const countPipeline = [...searchPipeline];
    countPipeline.push({ $count: 'total' });
    
    // Add pagination to search pipeline
    searchPipeline.push(
      { $skip: skip },
      { $limit: parseInt(limit) }
    );
    
    // Format output
    searchPipeline.push({
      $project: {
        _id: 1,
        matricNumber: 1,
        level: 1,
        user: '$userInfo._id',
        fullName: '$userInfo.fullName',
        email: '$userInfo.email',
        avatar: '$userInfo.avatar',
        bio: '$userInfo.bio',
        connectionCount: '$userInfo.connectionCount',
        department: { $arrayElemAt: ['$departmentInfo._id', 0] },
        departmentName: { $arrayElemAt: ['$departmentInfo.name', 0] },
        createdAt: 1
      }
    });
    
    // Execute the search query
    const students = await Student.aggregate(searchPipeline);
    
    // Execute count query
    const countResult = await Student.aggregate(countPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;
    
    // Get student IDs for connection lookup
    const studentUserIds = students.map(student => student.user);
    
    // Get connections between current user and search results
    const connections = await Connection.find({
      $or: [
        { requester: req.user.id, recipient: { $in: studentUserIds } },
        { recipient: req.user.id, requester: { $in: studentUserIds } }
      ]
    });
    
    // Format search results with connection status
    const formattedResults = students.map(student => {
      // Find connection with this student if it exists
      const connection = connections.find(conn => 
        (conn.requester.toString() === req.user.id && conn.recipient.toString() === student.user.toString()) || 
        (conn.recipient.toString() === req.user.id && conn.requester.toString() === student.user.toString())
      );
      
      // Determine if they're in the same department
      const sameDepartment = currentUserStudent && student.department && 
        currentUserStudent.department.toString() === student.department.toString();
      
      return {
        _id: student._id,
        user: {
          _id: student.user,
          fullName: student.fullName,
          email: student.email,
          avatar: student.avatar,
          bio: student.bio,
          connectionCount: student.connectionCount
        },
        matricNumber: student.matricNumber,
        level: student.level,
        department: student.departmentName,
        sameDepartment,
        connectionStatus: connection ? {
          connectionId: connection._id,
          status: connection.status,
          requestSent: connection.requester.toString() === req.user.id,
          requestReceived: connection.recipient.toString() === req.user.id
        } : null
      };
    });
    
    res.status(200).json({
      success: true,
      count: formattedResults.length,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      },
      data: formattedResults
    });
  } catch (error) {
    console.error('Error searching for students:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching for students',
      error: error.message
    });
  }
};

/**
 * @desc    Get student profile with connection status
 * @route   GET /api/connections/student/:studentId
 * @access  Private
 */
exports.getStudentProfile = async (req, res) => {
  try {
    const { studentId } = req.params;
    
    // Find student by ID
    const student = await Student.findById(studentId)
      .populate('user', 'fullName email avatar bio connectionCount')
      .populate('department', 'name');
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }
    
    // Check if there's a connection between the users
    const connection = await Connection.findOne({
      $or: [
        { requester: req.user.id, recipient: student.user._id },
        { recipient: req.user.id, requester: student.user._id }
      ]
    });
    
    // Get current user's student record
    const currentUserStudent = await Student.findOne({ user: req.user.id });
    
    // Determine if they're in the same department
    const sameDepartment = currentUserStudent && student.department && 
      currentUserStudent.department.toString() === student.department._id.toString();
    
    // Format response
    const profileData = {
      _id: student._id,
      user: {
        _id: student.user._id,
        fullName: student.user.fullName,
        email: student.user.email,
        avatar: student.user.avatar,
        bio: student.user.bio,
        connectionCount: student.user.connectionCount
      },
      matricNumber: student.matricNumber,
      level: student.level,
      department: student.department ? student.department.name : null,
      sameDepartment,
      connectionStatus: connection ? {
        connectionId: connection._id,
        status: connection.status,
        requestSent: connection.requester.toString() === req.user.id,
        requestReceived: connection.recipient.toString() === req.user.id
      } : null
    };
    
    res.status(200).json({
      success: true,
      data: profileData
    });
  } catch (error) {
    console.error('Error getting student profile:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting student profile',
      error: error.message
    });
  }
};

/**
 * @desc    Get departments list for search filtering
 * @route   GET /api/connections/departments
 * @access  Private
 */
exports.getDepartmentsForSearch = async (req, res) => {
  try {
    const departments = await Department.find()
      .select('name code faculty')
      .populate('faculty', 'name')
      .sort('name');
    
    res.status(200).json({
      success: true,
      count: departments.length,
      data: departments
    });
  } catch (error) {
    console.error('Error getting departments:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting departments',
      error: error.message
    });
  }
};