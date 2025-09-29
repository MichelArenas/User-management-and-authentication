const express = require('express');
const router = express.Router();
const verifyJWT = require('../middlewares/authMiddelware');
const permission = require('../middlewares/permissionMiddelware')
const Users = require('../controllers/UserController');

//http://localhost:3002/api/v1/users
router.post('/', verifyJWT, permission('user:create'), Users.createByAdmin); 
//http://localhost:3002/api/v1/users
router.get('/', verifyJWT, permission('user:list'), Users.listAll);
//http://localhost:3002/api/v1/users/IdObject/deactivate 
router.patch('/:id/deactivate', verifyJWT, permission('user:deactivate'), Users.deactivate);

//http://localhost:3002/api/v1/users/IdObject/deactivate
router.patch('/:id/deactivate', verifyJWT, requireRole('ADMIN'), Users.deactivate);

//http://localhost:3002/api/v1/users/IdObject/activate
router.patch('/:id/activate', verifyJWT, requireRole('ADMIN'), Users.activate);

//http://localhost:3002/api/v1/users/IdObject/password
router.put('/:id/password', verifyJWT, Users.updatePassword);

//http://localhost:3002/api/v1/users/activity-logs
router.get('/activity-logs', verifyJWT, requireRole('ADMIN'), Users.getActivityLogs);


module.exports = router;