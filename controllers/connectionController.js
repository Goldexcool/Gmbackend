const User = require('../models/User');
const Student = require('../models/Student');
const Connection = require('../models/Connection');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Department = require('../models/Department');
const mongoose = require('mongoose');

/**
 * @desc    Get connection suggestions for the user
 * @route   GET /api/connections/suggestions
 * @access  Private
 */
exports.getConnectionSuggestions = async (req, res) => {
  try {
    // First, check if the user is a student
    const student = await Student.findOne({ user: req.user.id });
    
    if (!student) {
      return res.status(400).json({
        success: false,
        message: 'Only students can use the connection feature'
      });
    }
    
    // Get current user's department
    const departmentId = student.department;
    
    if (!departmentId) {
      return res.status(400).json({
        success: false,
        message: 'You need to be assigned to a department to see connection suggestions'
      });
    }
    
    // Find all students in the same department
    const departmentStudents = await Student.find({
      department: departmentId,
      user: { $ne: req.user.id } // Exclude current user
    }).populate('user', 'fullName email avatar bio');
    
    // Get IDs of students from the same department
    const departmentStudentUserIds = departmentStudents.map(s => s.user._id);
    
    // Get IDs of users the current user is already connected with or has pending requests
    const connections = await Connection.find({
      $or: [
        { requester: req.user.id },
        { recipient: req.user.id }
      ]
    });
    
    const connectedUserIds = connections.map(c => 
      c.requester.toString() === req.user.id.toString() ? c.recipient : c.requester
    );
    
    // Filter out students who are already connected or have pending requests
    const filteredDepartmentStudents = departmentStudents.filter(
      s => !connectedUserIds.includes(s.user._id.toString())
    );
    
    // Find students from other departments (limit to 10)
    const otherStudents = await Student.find({
      department: { $ne: departmentId },
      user: { 
        $ne: req.user.id,
        $nin: connectedUserIds
      }
    })
      .populate('user', 'fullName email avatar bio')
      .limit(10);
    
    // Format response
    const departmentSuggestions = filteredDepartmentStudents.map(s => ({
      _id: s.user._id,
      fullName: s.user.fullName,
      email: s.user.email,
      avatar: s.user.avatar,
      bio: s.user.bio,
      matricNumber: s.matricNumber,
      level: s.level,
      sameDepartment: true
    }));
    
    const otherSuggestions = otherStudents.map(s => ({
      _id: s.user._id,
      fullName: s.user.fullName,
      email: s.user.email,
      avatar: s.user.avatar,
      bio: s.user.bio,
      matricNumber: s.matricNumber,
      level: s.level,
      department: s.department,
      sameDepartment: false
    }));
    
    res.status(200).json({
      success: true,
      data: {
        departmentSuggestions,
        otherSuggestions
      }
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
    
    // Check if trying to connect with self
    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot connect with yourself'
      });
    }
    
    // Check if recipient exists
    const recipient = await User.findById(userId);
    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check if a connection already exists between the users
    const existingConnection = await Connection.findOne({
      $or: [
        { requester: req.user.id, recipient: userId },
        { requester: userId, recipient: req.user.id }
      ]
    });
    
    if (existingConnection) {
      return res.status(400).json({
        success: false,
        message: 'A connection request already exists between these users',
        data: {
          connectionId: existingConnection._id,
          status: existingConnection.status
        }
      });
    }
    
    // Create connection request
    const connection = await Connection.create({
      requester: req.user.id,
      recipient: userId,
      status: 'pending',
      requestDate: Date.now()
    });
    
    // Add to recipient's connection requests
    await User.findByIdAndUpdate(userId, {
      $push: { connectionRequests: { user: req.user.id, requestDate: Date.now() } }
    });
    
    // Populate user data for response
    await connection.populate([
      { path: 'requester', select: 'fullName email avatar' },
      { path: 'recipient', select: 'fullName email avatar' }
    ]);
    
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
 * @desc    Get all conversations for the user
 * @route   GET /api/connections/conversations
 * @access  Private
 */
exports.getMyConversations = async (req, res) => {
  try {
    // Find all conversations where the user is a participant
    const conversations = await Conversation.find({
      participants: req.user.id,
      isActive: true
    })
      .populate({
        path: 'participants',
        select: 'fullName email avatar',
        match: { _id: { $ne: req.user.id } } // Only populate other participants
      })
      .sort({ 
        'lastMessage.timestamp': -1 
      });
    
    // Format conversations to include the other participant
    const formattedConversations = conversations.map(conversation => {
      const otherParticipant = conversation.participants[0]; // This should be the other user after filtering current user
      
      return {
        _id: conversation._id,
        otherUser: otherParticipant,
        lastMessage: conversation.lastMessage,
        unread: conversation.lastMessage && 
                !conversation.lastMessage.read && 
                conversation.lastMessage.sender.toString() !== req.user.id
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

/**
 * @desc    Get messages for a conversation
 * @route   GET /api/connections/conversations/:conversationId/messages
 * @access  Private
 */
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
    if (!conversation.participants.includes(req.user.id)) {
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
          conversation.lastMessage.sender.toString() !== req.user.id && 
          !conversation.lastMessage.read) {
        conversation.lastMessage.read = true;
        await conversation.save();
      }
    }
    
    // Get total count for pagination
    const total = await Message.countDocuments({ conversation: conversationId });
    
    // Get the other participant
    const otherParticipant = conversation.participants.find(
      p => p.toString() !== req.user.id
    );
    
    const otherUser = await User.findById(otherParticipant)
      .select('fullName email avatar');
    
    res.status(200).json({
      success: true,
      count: messages.length,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      },
      data: {
        conversation: {
          _id: conversation._id,
          otherUser
        },
        messages: messages.reverse() // Reverse back to chronological order
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