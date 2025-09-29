// routes/affiliationsRoutes.js
const express = require("express");
const router = express.Router();
const verifyJWT = require("../middlewares/authMiddelware");
const permission = require("../middlewares/permissionMiddelware");
const affiliations = require("../controllers/AffiliationsController");

//http://localhost:3002/api/v1/affiliations
router.post("/", verifyJWT, permission("affiliation:create"), affiliations.createAffiliation);
//http://localhost:3002/api/v1/affiliations/user/:userId
router.get("/user/:userId", verifyJWT, permission("affiliation:list"), affiliations.listAffiliationsByUser);
//http://localhost:3002/api/v1/affiliations/:id
router.delete("/:id", verifyJWT, permission("affiliation:delete"), affiliations.deleteAffiliation);

module.exports = router;
