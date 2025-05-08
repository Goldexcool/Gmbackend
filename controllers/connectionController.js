const User = require('../models/User');
const Student = require('../models/Student');
const Connection = require('../models/Connection');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Department = require('../models/Department');
const Post = require('../models/Post');
const Question = require('../models/Question');
const Answer = require('../models/Answer');
const ProfileView = require('../models/ProfileView');
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
      user: { $ne: req.user.id }
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
      return conn.requester.toString() === req.user.id.toString()
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
        connectionReason: student.department ? 'Same department' : 'May know each other'
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
      .populate({
        path: 'conversation',
        select: '_id',
        options: { strictPopulate: false } // Set this option to bypass schema check
      })
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
      participants: [connection.requester, connection.recipient],
      isActive: true
    }], { session });

    // Link conversation to connection
    connection.conversation = conversation[0]._id;
    await connection.save({ session });
    
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
    console.log('Getting conversations for user:', req.user.id);
    
    // Find conversations where the current user is a participant
    const conversations = await Conversation.find({
      participants: req.user.id
    }).sort('-updatedAt');
    
    console.log(`Found ${conversations.length} conversations for user ${req.user.id}`);
    
    // Format with additional details
    const formattedConversations = await Promise.all(conversations.map(async (conversation) => {
      // Find the other participant's ID
      let otherParticipantId = null;
      if (conversation.participants && Array.isArray(conversation.participants)) {
        // Find the ID that isn't the current user's ID
        for (const participantId of conversation.participants) {
          if (participantId.toString() !== req.user.id) {
            otherParticipantId = participantId;
            break;
          }
        }
      }
      
      // Get other participant's details
      let otherUser = null;
      if (otherParticipantId) {
        otherUser = await User.findById(otherParticipantId)
          .select('fullName email profileImage avatar');
          
        console.log(`Found other user: ${otherUser ? otherUser.fullName : 'null'}`);
      }
      
      // Get unread message count
      const unreadCount = await Message.countDocuments({
        conversation: conversation._id,
        sender: { $ne: req.user.id },
        read: false
      });
      
      return {
        id: conversation._id,
        title: conversation.title || 'Untitled Conversation',
        otherUser,
        lastMessage: conversation.lastMessage,
        lastUpdated: conversation.lastMessage ? conversation.lastMessage.timestamp : conversation.updatedAt,
        updatedAt: conversation.updatedAt,
        unreadCount,
        isActive: conversation.isActive,
        connection: conversation.connection
      };
    }));
    
    // Sort by most recent first
    formattedConversations.sort((a, b) => 
      new Date(b.lastUpdated) - new Date(a.lastUpdated)
    );
    
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
    const isParticipant = conversation.participants.some(
      p => p.toString() === req.user.id
    );
    
    if (!isParticipant) {
      console.log('User not authorized:', req.user.id);
      console.log('Conversation participants:', conversation.participants);
      
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
      .populate('sender', 'fullName avatar profileImage')
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
    const otherParticipantId = conversation.participants.find(
      p => p.toString() !== req.user.id
    );
    
    // Get other participant's details if available
    let otherUser = null;
    if (otherParticipantId) {
      otherUser = await User.findById(otherParticipantId)
        .select('fullName email profileImage avatar');
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
        otherUser
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
 * @desc    Advanced search for students by name, department, or level
 * @route   GET /api/connections/search
 * @access  Private
 */
exports.searchStudents = async (req, res) => {
  try {
    const { query, department, level } = req.query;
    
    // Build search criteria
    const searchCriteria = {
      role: 'student', // Only search for students
      _id: { $ne: req.user.id } // Exclude current user
    };
    
    // If neither query, department, or level is provided, require at least one
    if (!query && !department && !level) {
      return res.status(400).json({
        success: false,
        message: 'At least one search parameter is required (query, department, or level)'
      });
    }
    
    // Add name search if query is provided
    if (query) {
      searchCriteria.$or = [
        { fullName: { $regex: query, $options: 'i' } },
        { matricNumber: { $regex: query, $options: 'i' } }
      ];
    }
    
    // Add level filter if provided
    if (level) {
      searchCriteria.level = level;
    }
    
    console.log('Search criteria:', searchCriteria);
    
    // Find students based on search criteria (without populating department)
    const students = await User.find(searchCriteria)
      .select('fullName email profileImage avatar level bio interests skills');
    
    console.log(`Found ${students.length} students matching criteria`);
    
    // If department filter is needed, filter students after fetching
    let filteredStudents = students;
    if (department) {
      // Look up student records with this department
      const studentRecords = await Student.find({ 
        department: department,
        user: { $in: students.map(s => s._id) }
      });
      
      // Get list of user IDs with matching department
      const userIdsWithDept = studentRecords.map(s => s.user.toString());
      
      // Filter the students list
      filteredStudents = students.filter(s => 
        userIdsWithDept.includes(s._id.toString())
      );
    }
    
    // Get department info separately if needed
    const studentIds = filteredStudents.map(s => s._id);
    const studentDepartments = await Student.find({
      user: { $in: studentIds }
    }).populate('department', 'name').select('user department');
    
    // Create a map of user ID to department
    const departmentMap = {};
    studentDepartments.forEach(record => {
      if (record.department) {
        departmentMap[record.user.toString()] = {
          name: record.department.name,
          id: record.department._id
        };
      }
    });
    
    // Format the response
    const formattedStudents = filteredStudents.map(student => ({
      id: student._id,
      fullName: student.fullName,
      email: student.email,
      profileImage: student.profileImage,
      avatar: student.avatar,
      department: departmentMap[student._id.toString()] ? 
        departmentMap[student._id.toString()].name : null,
      departmentId: departmentMap[student._id.toString()] ? 
        departmentMap[student._id.toString()].id : null,
      level: student.level,
      bio: student.bio,
      interests: student.interests,
      skills: student.skills
    }));
    
    res.status(200).json({
      success: true,
      count: formattedStudents.length,
      data: formattedStudents
    });
  } catch (error) {
    console.error('Error searching students:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching students',
      error: error.message
    });
  }
};

/**
 * @desc    Get detailed student profile with expanded information
 * @route   GET /api/connections/student/:studentId
 * @access  Private
 */
/**
 * @desc    Get detailed student profile with department information
 * @route   GET /api/connections/student/:studentId
 * @access  Private
 */
exports.getStudentProfile = async (req, res) => {
  try {
    const { studentId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID format'
      });
    }
    
    // Find the user record
    const student = await User.findById(studentId)
      .select('fullName email profileImage avatar level');
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }
    
    // Find student record with explicit population of department
    const studentRecord = await Student.findOne({ user: studentId })
      .populate({
        path: 'department',
        select: 'name code faculty',
        options: { strictPopulate: false }
      });
    
    console.log('Student Record:', JSON.stringify(studentRecord, null, 2));
    
    // Extract department info with safeguards
    let departmentName = 'Not available';
    let departmentId = null;
    
    if (studentRecord && studentRecord.department) {
      // Check if department is a full object or just an ID
      if (typeof studentRecord.department === 'object') {
        departmentName = studentRecord.department.name || 'Not available';
        departmentId = studentRecord.department._id;
      } else {
        // If department is just an ID, fetch the department separately
        const departmentDetails = await Department.findById(studentRecord.department);
        if (departmentDetails) {
          departmentName = departmentDetails.name;
          departmentId = departmentDetails._id;
        }
      }
    }
    
    // Format the response with just the essential fields
    const formattedProfile = {
      id: student._id,
      fullName: student.fullName,
      email: student.email,
      profileImage: student.profileImage,
      avatar: student.avatar,
      level: student.level,
      matricNumber: studentRecord?.matricNumber || 'Not available',
      department: departmentName,
      departmentId: departmentId
    };
    
    res.status(200).json({
      success: true,
      data: formattedProfile
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

// Helper function to record profile views
async function recordProfileView(viewerId, viewedId) {
  try {
    // Don't record if viewing own profile
    if (viewerId === viewedId) return;
    
    // Create or update the profile view
    await ProfileView.findOneAndUpdate(
      { viewer: viewerId, viewed: viewedId },
      { $set: { viewedAt: new Date() } },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.error('Error recording profile view:', err);
  }
}

// Helper to format time ago
function formatTimeAgo(date) {
  if (!date) return 'Unknown';
  
  const now = new Date();
  const diff = now - new Date(date);
  
  // Convert milliseconds to appropriate units
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(months / 12);
  
  if (years > 0) return `${years} ${years === 1 ? 'year' : 'years'} ago`;
  if (months > 0) return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  if (days > 0) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  if (hours > 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  if (minutes > 0) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  return 'Just now';
}

// Helper to check if a user is online (stub - implement with your online tracking system)
function isUserOnline(userId) {
  // This would connect to your online user tracking system
  // For now, return a placeholder
  return false;
}

/**
 * @desc    Get departments for search filters
 * @route   GET /api/connections/departments
 * @access  Private
 */
exports.getDepartmentsForSearch = async (req, res) => {
  try {
    // Find all departments
    const departments = await Department.find({})
      .select('name code faculty')
      .sort('name');
    
    // Format the response
    const formattedDepartments = departments.map(dept => ({
      id: dept._id,
      name: dept.name,
      code: dept.code,
      faculty: dept.faculty
    }));
    
    res.status(200).json({
      success: true,
      count: formattedDepartments.length,
      data: formattedDepartments
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

/**
 * @desc    Create a new conversation
 * @route   POST /api/connections/conversations
 * @access  Private
 */
exports.createConversation = async (req, res) => {
  try {
    const { title, recipientId, initialMessage } = req.body;
    
    if (!recipientId) {
      return res.status(400).json({
        success: false,
        message: 'Recipient ID is required'
      });
    }
    
    // Check if recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: 'Recipient not found'
      });
    }
    
    // Check if conversation already exists between these users
    const existingConversation = await Conversation.findOne({
      participants: { 
        $all: [req.user.id, recipientId]
      }
    });
    
    if (existingConversation) {
      return res.status(200).json({
        success: true,
        message: 'Conversation already exists',
        data: existingConversation
      });
    }
    
    // Create new conversation
    const newConversation = new Conversation({
      participants: [req.user.id, recipientId],
      title: title || `Chat with ${recipient.fullName}`,
      isActive: true
    });
    
    // Add initial message if provided
    if (initialMessage) {
      const message = new Message({
        conversation: newConversation._id,
        sender: req.user.id,
        text: initialMessage,
        read: false
      });
      
      await message.save();
      
      newConversation.lastMessage = {
        sender: req.user.id,
        text: initialMessage,
        timestamp: new Date(),
        read: false
      };
    }
    
    await newConversation.save();
    
    res.status(201).json({
      success: true,
      data: newConversation
    });
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * @desc    Migrate connections to conversations
 * @access  Private
 */
async function migrateConnectionsToConversations() {
  try {
    // Find all accepted connections without a conversation
    const connections = await Connection.find({
      status: 'accepted',
      conversation: { $exists: false }
    });
    
    console.log(`Found ${connections.length} connections without conversations`);
    
    // Create conversations for each connection
    for (const connection of connections) {
      // Check if conversation already exists
      const existingConversation = await Conversation.findOne({
        participants: { $all: [connection.requester, connection.recipient] }
      });
      
      if (existingConversation) {
        // Link existing conversation
        connection.conversation = existingConversation._id;
        await connection.save();
        console.log(`Linked existing conversation to connection ${connection._id}`);
      } else {
        // Create new conversation
        const newConversation = await Conversation.create({
          participants: [connection.requester, connection.recipient],
          isActive: true
        });
        
        // Link to connection
        connection.conversation = newConversation._id;
        await connection.save();
        console.log(`Created new conversation for connection ${connection._id}`);
      }
    }
    
    console.log('Migration complete!');
  } catch (error) {
    console.error('Error in migration:', error);
 
  }
}