const authController = require('../controllers/AuthController');
const express = require('express');
const router = express.Router();

//http://localhost:3002/api/v1/auth/sign-up
router.post('/sign-up', authController.signup);
//http://localhost:3002/api/v1/auth/sign-in
router.post('/sign-in', authController.signin);
//http://localhost:3002/api/v1/auth/sign-in
//router.post('/sign-out', authController.signin);

module.exports = router;