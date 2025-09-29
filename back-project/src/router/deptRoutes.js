const express = require('express');

const router = express.Router();
const verifyJWT = require('../middlewares/authMiddelware');
const permission = require('../middlewares/permissionMiddelware')
const department = require('../controllers/DeptController');

//http://localhost:3002/api/v1/departments
router.post('/', verifyJWT, permission('department:create'), department.createDepartment); //
//http://localhost:3002/api/v1/departments
router.get('/', verifyJWT, permission('department:list'), department.listDepartments);

module.exports = router;