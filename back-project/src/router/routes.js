const express = require('express');
const router = express.Router();
const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const deptRoutes = require("./deptRoutes");
const specialtiesRoutes = require("./specialityRoutes");

//http://localhost:3002/api/v1/

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/departments", deptRoutes);
router.use("/specialties", specialtiesRoutes);
module.exports = router;
