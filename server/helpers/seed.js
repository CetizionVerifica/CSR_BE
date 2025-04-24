const config = require("../config/keys");
const UserModel = require("../models/user");

const seedAdmin = async () => {
  const adminEmail = config.adminEmail;

  try {
    const existingUser = await UserModel.findOne({ email: adminEmail });

    if (existingUser) {
      console.log("Admin user already exists");
      return;
    }

    if (!config.adminDefaultPassword) {
      console.log("Admin default password not set");
      return;
    }

    const user = new UserModel({
      email: adminEmail,
      password: config.adminDefaultPassword,
      name: "Admin",
      role: "superadmin",
      jobPosition: "-",
      phone: "-",
      termsAndConditions: true,
      companies: [],
      active: true,
      agencies: [],
      lang: "en",
    });

    await user.save();
    console.log("Admin user created successfully");
  } catch (error) {
    console.error("Error seeding admin user:", error);
  }
};

module.exports = {
  seedAdmin,
};
