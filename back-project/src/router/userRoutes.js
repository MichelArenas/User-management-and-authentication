const express = require('express');
const router = express.Router();
const verifyJWT = require('../middlewares/authMiddelware');
const permission = require('../middlewares/permissionMiddelware')
const Users = require('../controllers/UserController');
const requireRole = require('../middlewares/roleMiddelware');

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } }); // 60MB limit


//http://localhost:3002/api/v1/users
router.post('/', verifyJWT, permission('user:create'), Users.createByAdmin); 
//http://localhost:3002/api/v1/users
router.get('/', verifyJWT, permission('user:list'), Users.getAllUsers);
//http://localhost:3002/api/v1/users/IdObject
router.get('/:id', Users.getUserById);

//http://localhost:3002/api/v1/users/IdObject/deactivate 
router.patch('/:id/deactivate', verifyJWT, permission('user:deactivate'), Users.deactivate);

//http://localhost:3002/api/v1/users/IdObject/activate
router.patch('/:id/activate', verifyJWT, permission('user:activate'), Users.activate);

//http://localhost:3002/api/v1/users/IdObject/password
router.put('/:id/password', verifyJWT, Users.updatePassword);

//http://localhost:3002/api/v1/users/activity-logs
router.get('/activity-logs', verifyJWT, requireRole('ADMINISTRADOR'), Users.getActivityLogs);
//http://localhost:3002/api/v1/users/bulk-import
router.post('/bulk-import', verifyJWT, permission('user:create'), upload.single('file'), Users.bulkImport);



module.exports = router;