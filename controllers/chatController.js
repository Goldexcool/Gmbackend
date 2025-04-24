const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const { bucket } = require('../config/firebase');
const path = require('path');
const fs = require('fs');

exports.getChats = async (req, res) => {
  try {
    // Find chats where the current user is a participant
    const chats = await Chat.find({
      participants: { $elemMatch: { $eq: req.user.id } }
    })
      .populate('participants', 'fullName email avatar')
      .populate('latestMessage')
      .sort({ updatedAt: -1 });

    // Populate the sender of the latest message
    if (chats.length > 0) {
      await User.populate(chats, {
        path: 'latestMessage.sender',
        select: 'fullName email avatar'
      });
    }

    res.status(200).json({
      success: true,
      count: chats.length,
      data: chats
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};


exports.createChat = async (req, res) => {
  try {
    const { participantIds, isGroupChat, name, description } = req.body;

    if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one participant'
      });
    }

    // Add current user to participants if not already included
    const uniqueParticipantIds = [...new Set([...participantIds, req.user.id])];

    // Validate all participants exist
    const participants = await User.find({ _id: { $in: uniqueParticipantIds } });
    
    if (participants.length !== uniqueParticipantIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more participants do not exist'
      });
    }

    // For one-to-one chat, check if it already exists
    if (!isGroupChat && uniqueParticipantIds.length === 2) {
      const existingChat = await Chat.findOne({
        isGroupChat: false,
        $and: [
          { participants: { $elemMatch: { $eq: uniqueParticipantIds[0] } } },
          { participants: { $elemMatch: { $eq: uniqueParticipantIds[1] } } }
        ]
      }).populate('participants', 'fullName email avatar');

      if (existingChat) {
        return res.status(200).json({
          success: true,
          message: 'Chat already exists',
          data: existingChat
        });
      }
    }

    // Create new chat
    const chatData = {
      participants: uniqueParticipantIds,
      isGroupChat,
      groupAdmin: req.user.id
    };

    // Add optional fields for group chats
    if (isGroupChat) {
      if (!name) {
        return res.status(400).json({
          success: false,
          message: 'Group chat requires a name'
        });
      }
      chatData.name = name;
      chatData.description = description || '';
    }

    const newChat = await Chat.create(chatData);
    
    // Get full details with populated fields
    const fullChat = await Chat.findById(newChat._id)
      .populate('participants', 'fullName email avatar')
      .populate('groupAdmin', 'fullName email avatar');

    res.status(201).json({
      success: true,
      data: fullChat
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.getChatById = async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId)
      .populate('participants', 'fullName email avatar')
      .populate('groupAdmin', 'fullName email avatar')
      .populate('latestMessage');

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    // Check if user is a participant
    if (!chat.participants.some(p => p._id.toString() === req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this chat'
      });
    }

    // Populate the sender of the latest message
    if (chat.latestMessage) {
      await User.populate(chat, {
        path: 'latestMessage.sender',
        select: 'fullName email avatar'
      });
    }

    res.status(200).json({
      success: true,
      data: chat
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.updateChat = async (req, res) => {
  try {
    const { name, description } = req.body;
    
    const chat = await Chat.findById(req.params.chatId);
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }
    
    // Check if user is a participant
    if (!chat.participants.includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this chat'
      });
    }
    
    // Only group admin or system admin can update group chats
    if (chat.isGroupChat && 
        chat.groupAdmin.toString() !== req.user.id && 
        req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only group admin can update group chat details'
      });
    }
    
    // Update fields
    if (name) chat.name = name;
    if (description) chat.description = description;
    
    await chat.save();
    
    const updatedChat = await Chat.findById(chat._id)
      .populate('participants', 'fullName email avatar')
      .populate('groupAdmin', 'fullName email avatar');
    
    res.status(200).json({
      success: true,
      data: updatedChat
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.addUserToChat = async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a user ID'
      });
    }
    
    const chat = await Chat.findById(req.params.chatId);
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }
    
    // Only group chats can have users added
    if (!chat.isGroupChat) {
      return res.status(400).json({
        success: false,
        message: 'Cannot add users to one-to-one chat'
      });
    }
    
    // Only group admin or system admin can add users
    if (chat.groupAdmin.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only group admin can add users'
      });
    }
    
    // Check if user already in chat
    if (chat.participants.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: 'User is already in this chat'
      });
    }
    
    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Add user to chat
    chat.participants.push(userId);
    await chat.save();
    
    const updatedChat = await Chat.findById(chat._id)
      .populate('participants', 'fullName email avatar')
      .populate('groupAdmin', 'fullName email avatar');
    
    res.status(200).json({
      success: true,
      message: 'User added to chat',
      data: updatedChat
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.removeUserFromChat = async (req, res) => {
  try {
    const { chatId, userId } = req.params;
    
    const chat = await Chat.findById(chatId);
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }
    
    // Only group chats can have users removed
    if (!chat.isGroupChat) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove users from one-to-one chat'
      });
    }
    
    // Check authorization (only group admin can remove others, users can remove themselves)
    const isSelf = userId === req.user.id;
    const isGroupAdmin = chat.groupAdmin.toString() === req.user.id;
    const isSystemAdmin = req.user.role === 'admin';
    
    if (!isSelf && !isGroupAdmin && !isSystemAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to remove users from this chat'
      });
    }
    
    // Check if user is in chat
    if (!chat.participants.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: 'User is not in this chat'
      });
    }
    
    // Cannot remove the group admin (need to transfer ownership first)
    if (userId === chat.groupAdmin.toString() && !isSystemAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Group admin cannot be removed without transferring ownership'
      });
    }
    
    // Remove user from chat
    chat.participants = chat.participants.filter(
      participant => participant.toString() !== userId
    );
    
    await chat.save();
    
    const updatedChat = await Chat.findById(chat._id)
      .populate('participants', 'fullName email avatar')
      .populate('groupAdmin', 'fullName email avatar');
    
    res.status(200).json({
      success: true,
      message: 'User removed from chat',
      data: updatedChat
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};


exports.deleteChat = async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId);
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }
    
    // Check authorization
    const isParticipant = chat.participants.includes(req.user.id);
    const isGroupAdmin = chat.isGroupChat && chat.groupAdmin.toString() === req.user.id;
    const isSystemAdmin = req.user.role === 'admin';
    
    // One-to-one chats can be deleted by any participant
    // Group chats can only be deleted by group admin or system admin
    if (!isParticipant || (chat.isGroupChat && !isGroupAdmin && !isSystemAdmin)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this chat'
      });
    }
    
    // Delete all messages in the chat
    await Message.deleteMany({ chat: chat._id });
    
    // Delete the chat
    await chat.deleteOne();
    
    res.status(200).json({
      success: true,
      message: 'Chat and all messages deleted'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};


exports.sendMessage = async (req, res) => {
  try {
    const { content } = req.body;
    const { chatId } = req.params;
    
    if (!content && (!req.files || req.files.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide message content or attachments'
      });
    }
    
    const chat = await Chat.findById(chatId);
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }
    
    // Check if user is a participant
    if (!chat.participants.includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to send messages to this chat'
      });
    }
    
    let attachments = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        let fileUrl = '';
        let fileName = '';
        
        // If Firebase is available, upload to Firebase Storage
        if (bucket && bucket.file) {
          // Generate unique filename
          fileName = `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`;
          const filePath = file.path;
          
          // Upload to Firebase
          try {
            const blob = bucket.file(`chat-attachments/${fileName}`);
            const blobStream = blob.createWriteStream({
              metadata: {
                contentType: file.mimetype
              }
            });
            
            await new Promise((resolve, reject) => {
              blobStream.on('error', reject);
              blobStream.on('finish', resolve);
              fs.createReadStream(filePath).pipe(blobStream);
            });
            
            // Make the file public
            await blob.makePublic();
            fileUrl = `https://storage.googleapis.com/${bucket.name}/chat-attachments/${fileName}`;
            
            // Delete the temp file
            fs.unlinkSync(filePath);
          } catch (error) {
            console.error('Firebase upload error:', error);
            // Fallback to local storage
          }
        }
        
        if (!fileUrl) {
          const uploadDir = path.join(__dirname, '../uploads/chat-attachments');
          
          // Create directory if it doesn't exist
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }
          
          fileName = `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`;
          const targetPath = path.join(uploadDir, fileName);
          
          // Move the file to the uploads directory
          fs.copyFileSync(file.path, targetPath);
          fs.unlinkSync(file.path); // Delete the temp file
          
          // Create a relative URL
          fileUrl = `/uploads/chat-attachments/${fileName}`;
        }
        
        attachments.push({
          fileName: file.originalname,
          fileType: file.mimetype,
          fileUrl
        });
      }
    }
    
    const message = await Message.create({
      sender: req.user.id,
      content: content || '',
      chat: chatId,
      attachments: attachments,
      readBy: [req.user.id] 
    });
    
    chat.latestMessage = message._id;
    await chat.save();
    
    // Get complete message details
    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'fullName avatar')
      .populate('chat');
    
    res.status(201).json({
      success: true,
      data: populatedMessage
    });
    

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};


exports.getMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    // Check if chat exists
    const chat = await Chat.findById(chatId);
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }
    
    // Check if user is a participant
    if (!chat.participants.includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access messages from this chat'
      });
    }
    
    // Get messages with pagination (latest messages first)
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const messages = await Message.find({ chat: chatId })
      .populate('sender', 'fullName email avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    await Message.updateMany(
      { 
        chat: chatId, 
        readBy: { $ne: req.user.id }
      },
      { 
        $addToSet: { readBy: req.user.id } 
      }
    );
    
    const total = await Message.countDocuments({ chat: chatId });
    
    res.status(200).json({
      success: true,
      count: messages.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: messages
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};