const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
// Assuming you have an authentication middleware

// Create a new user (accessible by admin/superadmin)
router.post("/users", userController.createUser);

// Get all users (accessible by admin/superadmin)
router.get("/users", userController.getAllUsers);

router.post("/users/reset-password", userController.resetPassword);

// Get user by ID
router.get("/users/:id", userController.getUserById);

module.exports = router;
