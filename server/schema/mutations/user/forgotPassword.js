const { GraphQLString, GraphQLBoolean } = require("graphql");
const jwt = require("jwt-simple");
const nodeMaler = require("../../../services/nodeMaler");
const UserModel = require("../../../models/user");
const config = require("../../../config/keys");

const { checkAuth } = require("../../../services/checkAuth");

function generateOTP(length = 6) {
  const digits = "0123456789";
  let OTP = "";
  for (let i = 0; i < length; i++) {
    OTP += digits[Math.floor(Math.random() * 10)];
  }
  return OTP;
}

module.exports = {
  type: GraphQLBoolean,
  args: {
    email: {
      name: "email",
      type: GraphQLString,
    },
  },
  async resolve(root, params, context, options) {
    //   checkAuth(context.isAuthenticated())
    const user = await UserModel.findOne({ email: params.email });
    if (!user) {
      throw new Error("User does not exist");
    }

    // Generate a random 6-digit OTP
    const otp = generateOTP();

    // Save the OTP to the user record with an expiration time (30 minutes)
    user.otp = otp;
    // user.resetPasswordExpires = Date.now() + 30 * 60 * 1000; // 30 minutes
    await user.save();

    const mailOptions = {
      from: "Resilisense <notifyme@carbon-lens.com>", // sender address
      to: params.email, // list of receivers
      subject: "Password Reset OTP", // Subject line

      html: `<p>Dear Sir / Madam,</p>
        <p>You have received this email because you have requested to reset your password.</p>
        
        <p>Your OTP for password reset is: <strong>${otp}</strong></p>
        <p>This OTP will expire in 30 minutes.</p>
        
        <p>For technical support to access The 7 Toolkit or any other enquiries please email info@seven-toolkit.com.</p>
        
        <p>Thank you for your participation!</p>
        
        <p>With best regards,</p>
        
        <p>The 7 Tookit Team</p>`, // html body
    };

    nodeMaler(mailOptions).catch(console.error);
    return true;
  },
};
