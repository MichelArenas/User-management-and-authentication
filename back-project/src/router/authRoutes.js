const authController = require('../controllers/AuthController');
const express = require('express');
const router = express.Router();
const verifyJWT = require('../middlewares/authMiddelware');
const requireRole = require('../middlewares/roleMiddelware');

//http://localhost:3002/api/v1/auth/sign-up
router.post('/sign-up', authController.signup);

//http://localhost:3002/api/v1/auth/sign-in
router.post('/sign-in', authController.signin);

//http://localhost:3002/api/v1/auth/verify-email
router.post('/verify-email', authController.verifyEmail);

//http://localhost:3002/api/v1/auth/resend-verification
router.post('/resend-verification', authController.resendVerificationCode);

//http://localhost:3002/api/v1/auth/logout
router.post('/logout', verifyJWT, authController.logout);

module.exports = router;