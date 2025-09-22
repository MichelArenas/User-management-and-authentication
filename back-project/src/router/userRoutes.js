const express = require('express');
const router = express.Router();
const verifyJWT = require('../middlewares/authMiddelware');
const requireRole = require('../middlewares/roleMiddelware');
const Users = require('../controllers/UserController');

//http://localhost:3002/api/v1/auth/users
router.post('/', verifyJWT, requireRole('ADMIN'), Users.createByAdmin);
//http://localhost:3002/api/v1/auth/users
router.get('/', verifyJWT, requireRole('ADMIN'), Users.listAll);
//http://localhost:3002/api/v1/auth/IdObject/deactivate 
router.patch('/:id/deactivate', verifyJWT, requireRole('ADMIN'), Users.deactivate);

module.exports = router;