const express = require('express');
const router = express.Router();
const studyGroupController = require('../controllers/studyGroupController');
const { protect } = require('../middleware/authMiddleware');
const fileUpload = require('../middleware/fileUpload');

// Apply auth middleware to all routes
router.use(protect);

// Study group management
router.post('/', 
  fileUpload.single('avatar'),
  studyGroupController.createStudyGroup
);
router.get('/', studyGroupController.getMyStudyGroups);
router.get('/available', studyGroupController.getAvailableStudyGroups);
router.get('/search', studyGroupController.searchStudyGroups);
router.get('/:groupId', studyGroupController.getStudyGroupDetails);
router.put('/:groupId',
  fileUpload.single('avatar'),
  studyGroupController.updateStudyGroup
);
router.delete('/:groupId', studyGroupController.deleteStudyGroup);

// Membership management
router.post('/:groupId/join', studyGroupController.requestToJoinGroup);
router.post('/:groupId/invite/:userId', studyGroupController.inviteToGroup);
router.post('/:groupId/accept-invite', studyGroupController.acceptGroupInvitation);
router.post('/:groupId/decline-invite', studyGroupController.declineGroupInvitation);
router.post('/:groupId/approve-request/:userId', studyGroupController.approveJoinRequest);
router.post('/:groupId/reject-request/:userId', studyGroupController.rejectJoinRequest);
router.put('/:groupId/members/:userId/role', studyGroupController.updateMemberRole);
router.delete('/:groupId/members/:userId', studyGroupController.removeMember);
router.delete('/:groupId/leave', studyGroupController.leaveGroup);

// Message management
router.get('/:groupId/messages', studyGroupController.getGroupMessages);
router.post('/:groupId/messages',
  fileUpload.uploadMultiple('attachments', 5),
  studyGroupController.sendGroupMessage
);
router.put('/:groupId/messages/:messageId', studyGroupController.editGroupMessage);
router.delete('/:groupId/messages/:messageId', studyGroupController.deleteGroupMessage);
router.post('/:groupId/messages/:messageId/pin', studyGroupController.pinGroupMessage);
router.post('/:groupId/messages/:messageId/unpin', studyGroupController.unpinGroupMessage);

module.exports = router;