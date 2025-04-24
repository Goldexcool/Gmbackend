module.exports = {
    JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key-for-development',
    JWT_EXPIRE: process.env.JWT_EXPIRE || '30d',
    ROLES: {
        STUDENT: 'student',
        LECTURER: 'lecturer',
        ADMIN: 'admin'
    },
    RESOURCE_TYPES: {
        NOTE: 'note',
        TEXTBOOK: 'textbook',
        PAST_QUESTION: 'past_question',
        OTHER: 'other'
    },
    STUDY_GROUP_TYPES: {
        PUBLIC: 'public',
        PRIVATE: 'private'
    },
    TASK_STATUS: {
        PENDING: 'pending',
        COMPLETED: 'completed'
    }
};