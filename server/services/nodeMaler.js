// const nodemailer = require('nodemailer')
// const {appEmail, appMailPassword} = require('../config/keys');

// // async..await is not allowed in global scope, must use a wrapper
// const main = async(mailOptions) => {

//   const transporter = nodemailer.createTransport({
//     pool: true,
//     host: 'mail.resilisense.com',
//     port: 465,
//     secure: true,
//     authMethod: 'PLAIN',
//     auth: {
//       user: appEmail,
//       pass: appMailPassword,
//     },
//     tls: {
//       rejectUnauthorized: false,
//     },
//   })

//   // send mail with defined transport object
//   const info = await transporter.sendMail(mailOptions)

//   // console.log('Message sent: %s', info.messageId)
//   // Preview only available when sending through an Ethereal account
//   // console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info))
// }

// module.exports = main
//main().catch(console.error)

const nodemailer = require("nodemailer");
const { appEmail, appMailPassword } = require("../config/keys");

const main = async (mailOptions) => {
  const transporter = nodemailer.createTransport({
    pool: true,
    host: "smtpout.secureserver.net",
    port: 465,
    secure: true,
    auth: {
      type: "login",
      user: "notifyme@carbon-lens.com",
      pass: "piku@1234",
    },
    tls: {
      rejectUnauthorized: false,
    },
    debug: true,
    logger: true,
  });

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Message sent: %s", info.messageId);
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

module.exports = main;
