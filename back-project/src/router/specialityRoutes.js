const express = require('express');
const router = express.Router();
const verifyJWT = require('../middlewares/authMiddelware');
const permission = require('../middlewares/permissionMiddelware')
const specialty = require('../controllers/specialityController');

//http://localhost:3002/api/v1/specialties
router.post('/', verifyJWT, permission('specialty:create'), specialty.createSpecialty); //
//http://localhost:3002/api/v1/specialties
router.get('/', verifyJWT, permission('specialty:list'), specialty.listSpecialties);
//http://localhost:3002/api/v1/specialties/department/:departmentId
router.get('/department/:departmentId', verifyJWT, permission('specialty:list'), specialty.listByDepartment);

module.exports = router;