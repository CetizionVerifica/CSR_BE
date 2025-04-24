const UserModel = require("../models/user");
const AgencyModel = require("../models/agency");
const CompanyModel = require("../models/company");

/**
 * Create a new user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.createUser = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role,
      companies,
      agencies,
      jobPosition,
      phone,
      extension,
      active,
      country,
      sector,
      type,
      totalCompaniesAllowed,
    } = req.body;

    // Basic validation
    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ error: "Name, email, and password are required fields" });
    }

    // Check if user with email already exists
    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      return res
        .status(409)
        .json({ error: "User with this email already exists" });
    }

    // Default values for companies and agencies if not provided
    const userCompanies = companies && companies.length > 0 ? companies : [];
    const userAgencies = agencies && agencies.length > 0 ? agencies : [];

    // Validate companies and agencies if provided
    if (userCompanies.length > 0) {
      const company = await CompanyModel.findById(userCompanies[0]);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
    }

    if (userAgencies.length > 0) {
      const agency = await AgencyModel.findById(userAgencies[0]);
      if (!agency) {
        return res.status(404).json({ error: "Agency not found" });
      }
    }

    // Create user object
    const userData = {
      name,
      email,
      password,
      role: role || "user",
      companies: userCompanies,
      agencies: userAgencies,
      currentAgency: userAgencies.length > 0 ? userAgencies[0] : null,
      jobPosition,
      phone,
      extension,
      active: active !== undefined ? active : true,
      country,
      sector,
      type,
      totalCompaniesAllowed,
      date: new Date(),
    };

    // Create and save new user
    const newUser = new UserModel(userData);
    const savedUser = await newUser.save();

    // Remove password from response
    const userResponse = savedUser.toObject();
    delete userResponse.password;

    res.status(201).json(userResponse);
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({
      error: "Failed to create user",
      details: error.message,
    });
  }
};

/**
 * Get all users
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getAllUsers = async (req, res) => {
  try {
    const users = await UserModel.find({})
      .select("-password")
      .populate("companies", "name")
      .populate("agencies", "name");

    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

/**
 * Get user by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getUserById = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await UserModel.findById(userId)
      .select("-password")
      .populate("companies", "name")
      .populate("agencies", "name");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    console.log(req.body);
    // Basic validation
    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        error: "Email, OTP, and new password are required",
      });
    }

    // Find user by email
    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if OTP matches and is not expired
    if (user.otp !== otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    // Check if OTP is expired (assuming resetPasswordExpires field exists)
    // if (user.resetPasswordExpires && user.resetPasswordExpires < Date.now()) {
    //   return res.status(400).json({ error: "OTP has expired" });
    // }

    // Update password (mongoose pre-save hook will hash the password)
    user.password = newPassword;

    // Clear OTP and expiry after successful reset
    user.otp = undefined;
    // user.resetPasswordExpires = undefined; // Uncommenting this line to clear expiry

    await user.save();

    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({
      error: "Failed to reset password",
      details: error.message,
    });
  }
};
