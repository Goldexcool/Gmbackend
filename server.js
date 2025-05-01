// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');

// Import models - make sure these are defined before using them
const User = require('./models/User');
const Course = require('./models/Course');
const Student = require('./models/Student');
const Lecturer = require('./models/Lecturer');
const Schedule = require('./models/Schedule');

// For new models, make sure to import them directly
const Announcement = require('./models/Announcement');
const FAQ = require('./models/FAQ');  
const Settings = require('./models/Settings');
const AcademicSession = require('./models/AcademicSession');
const ExamTimetable = require('./models/ExamTimetable');

// Import routes
const authRoutes = require('./routes/authRoutes');
const studentRoutes = require('./routes/studentRoutes');
const lecturerRoutes = require('./routes/lecturerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const resourceRoutes = require('./routes/resourceRoutes');
const aiRoutes = require('./routes/aiRoutes');
const chatRoutes = require('./routes/chatRoutes');
const courseRoutes = require('./routes/courseRoutes');
const userRoutes = require('./routes/userRoutes');
const conversationRoutes = require('./routes/conversationRoutes');
const timetableRoutes = require('./routes/timetableRoutes');
const academicSessionRoutes = require('./routes/academicSessionRoutes');
const assignmentRoutes = require('./routes/assignmentRoutes');
const taskRoutes = require('./routes/taskRoutes');

// Import middleware
const errorHandler = require('./middleware/errorHandler');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Function to check and fix MongoDB indexes
const fixMongoIndexes = async () => {
  try {
    // Get the Conversation model
    const Conversation = mongoose.model('Conversation');
    
    // Drop both problematic indexes
    try {
      await Conversation.collection.dropIndex('connection_1');
      console.log('Dropped connection_1 index');
    } catch (error) {
      console.log('Note: connection_1 index might not exist');
    }
    
    try {
      await Conversation.collection.dropIndex('user_1_connection_1');
      console.log('Dropped user_1_connection_1 index');
    } catch (error) {
      console.log('Note: user_1_connection_1 index might not exist');
    }
  } catch (error) {
    console.error('Error fixing indexes:', error);
  }
};

// Call this after connection is established
mongoose.connection.once('open', () => {
  console.log('MongoDB connected');
  fixMongoIndexes();
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log route types
console.log("Type of authRoutes:", typeof authRoutes);
console.log("Type of userRoutes:", typeof userRoutes);
console.log("Type of adminRoutes:", typeof adminRoutes);
console.log("Type of lecturerRoutes:", typeof lecturerRoutes);
console.log("Type of studentRoutes:", typeof studentRoutes);
// ... and so on for each route

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/lecturer', lecturerRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/timetables', timetableRoutes);
app.use('/api/academic-sessions', academicSessionRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/tasks', taskRoutes);

// Root route
app.get('/', (req, res) => {
  res.send('GEM-SPACE API is running');
});

// Socket.io for real-time chat
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room: ${roomId}`);
  });
  
  socket.on('leave_room', (roomId) => {
    socket.leave(roomId);
    console.log(`User ${socket.id} left room: ${roomId}`);
  });
  
  socket.on('send_message', (data) => {
    io.to(data.roomId).emit('receive_message', data);
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Handle 404 - Route not found
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}`,
    suggestion: 'Please check the API documentation for available endpoints'
  });
});

// Error handling middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});