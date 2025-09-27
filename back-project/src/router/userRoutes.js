const express = require('express');
const router = express.Router();
const verifyJWT = require('../middlewares/authMiddelware');
const requireRole = require('../middlewares/roleMiddelware');
const Users = require('../controllers/UserController');

//http://localhost:3002/api/v1/users
router.post('/', verifyJWT, requireRole('ADMIN'), Users.createByAdmin);

//http://localhost:3002/api/v1/users
router.get('/', verifyJWT, requireRole('ADMIN'), Users.listAll);

//http://localhost:3002/api/v1/users/IdObject/deactivate
router.patch('/:id/deactivate', verifyJWT, requireRole('ADMIN'), Users.deactivate);

//http://localhost:3002/api/v1/users/IdObject/activate
router.patch('/:id/activate', verifyJWT, requireRole('ADMIN'), Users.activate);

//http://localhost:3002/api/v1/users/IdObject/password
router.put('/:id/password', verifyJWT, Users.updatePassword);


module.exports = router;