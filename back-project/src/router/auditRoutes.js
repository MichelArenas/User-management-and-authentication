const express = require('express');
const router = express.Router();
const AuditController = require('../controllers/AuditController');
const authMiddleware = require('../middlewares/authMiddelware');
const requireRole = require('../middlewares/roleMiddelware');

//http://localhost:3002/api/v1/audit
router.get('/', authMiddleware, requireRole(['ADMINISTRADOR']), AuditController.getActivityLogs);

//http://localhost:3002/api/v1/audit/entityType/entityId
router.get('/:entityType/:entityId', authMiddleware, requireRole(['ADMINISTRADOR']), AuditController.getEntityAuditTrail);

module.exports = router;