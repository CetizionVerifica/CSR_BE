// const jwt = require('jwt-simple')
const jwt = require("jwt-simple");
const User = require("../models/user");
const config = require("../config/keys");
const nodeMaler = require("../services/nodeMaler");

function tokenForUser(user) {
  console.log(user);
  const timestamp = new Date().getTime();
  return jwt.encode(
    { sub: user.id, role: user.role, iat: timestamp },
    config.secretJWT
  );
}
function decodeToken(token) {
  return jwt.decode(token, config.secretJWT);
}

exports.verifyEmail = function (req, res, next) {
  const token = req.params.token;
  const newuser = req.params.newuser;

  try {
    const user = decodeToken(token);
    var url = "";

    if (newuser == 1) {
      url = `https://${config.applicationUrl}/newuser?token=${token}`;
    } else {
      url = `https://${config.applicationUrl}/change-password?token=${token}`;
    }

    // const url = newuser === '1' ? `${config.applicationUrl}/newuser?token=${token}` : `${config.applicationUrl}/change-password?token=${token}`
    res.writeHead(302, { Location: url });
    res.end();
  } catch (error) {
    res.json({ error });
  }
};

exports.signin = function (req, res, next) {
  //User has already this email and password auth
  // we just need to give them token
  console.log(req.user);
  if (!req.user) {
    res.status(422).send({ error: "wrong username or password" });
  }
  res.send({ token: tokenForUser(req.user) });
};

// exports.signup = function (req, res, next) {
//   const email = req.body.email
//   const password = req.body.password
//   const name = req.body.name
//   const organisation = req.body.organisation
//   const jobPosition = req.body.jobPosition
//   const phone = req.body.phone
//   const comments = req.body.comments
//   console.log(email)
//   if (!email || !password || !name || !organisation || !jobPosition || !phone) {
//     return res.status(422).send({ error: 'you must provide email and password' })
//   }
//   // see if a user with the given email
//   User.findOne({ email: email }, (err, existingUser) => {
//     if (err) { return next(err) }
//     // if a user with email dose exit, return an error
//     if (existingUser) {
//       return res.status(422).send({ error: 'Email is in use' })
//     }
//     //if a user with email does not exist, create and save user
//     const user = new User({
//       email: email,
//       password: password,
//       name: name,
//       jobPosition,
//       phone,
//       active: false,
//     })

//     user.save((err) => {
//       if (err) { return next(err) }

//       const mailOptions = {
//         from: 'Resilisense <noreply@resilisense.com>', // sender address
//         to: email, // list of receivers
//         subject: 'New registration', // Subject line
//         //text: 'Hello world?', // plain text body
//         html: `<b>New registration</b>
//         <p>name: ${name}</p>
//         <p>Work email: ${email}</p>
//         <p>organisation: ${organisation}</p>
//         <p>jobPosition: ${jobPosition}</p>
//         <p>Work telephone number: ${phone}</p>
//         <p>Comments: ${comments}</p>
//         <p>http://localhost:4000/api/verify-email/${tokenForUser(user)}</p>
//         `, // html body
//       }

//       nodeMaler(mailOptions).catch(console.error)
//       //respond to request indicating the user was created
//       res.json({ token: tokenForUser(user) })
//     })
//   })
// }

exports.signup = async function (req, res, next) {
  console.log("hello");
  const {
    email,
    password,
    name,
    organisation,
    jobPosition,
    phone,
    comments,
    role,
  } = req.body;

  if (!email || !password || !name || !organisation || !jobPosition || !phone) {
    return res.status(422).send({
      error:
        "You must provide email, password, name, organisation, job position, and phone",
    });
  }

  try {
    // Check if a user with the given email already exists
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(422).send({ error: "Email is in use" });
    }

    // Create a new user
    const user = new User({
      email,
      password,
      name,
      role,
      jobPosition,
      phone,
      active: false,
      agencies: [],
    });

    // Save the user
    await user.save();

    // Prepare and send email
    const mailOptions = {
      from: "Resilisense <noreply@resilisense.com>",
      to: email,
      subject: "New registration",
      html: `
        <b>New registration</b>
        <p>Name: ${name}</p>
        <p>Work email: ${email}</p>
        <p>Organisation: ${organisation}</p>
        <p>Job Position: ${jobPosition}</p>
        <p>Work telephone number: ${phone}</p>
        <p>Comments: ${comments}</p>
        <p>http://localhost:4000/api/verify-email/${tokenForUser(user)}</p>
      `,
    };

    await nodeMaler(mailOptions);

    // Respond to request indicating the user was created
    res.json({ token: tokenForUser(user) });
  } catch (err) {
    next(err);
  }
};
