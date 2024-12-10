module.exports = {
  googleClientID: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  mongoURI: process.env.MONGO_URI,
  cookieKey: process.env.COOKIE_KEY,
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  stripeSecretKey: process.env.STRIPE_SCERET_KEY,
  sendGridKey: process.env.SEND_GRID_KEY,
  redirectDomain: process.env.REDIRCT_DOMAIN,
  secretJWT: process.env.SCERET_JWT,
  secretSession: process.env.SESSION_SECRET,
  // applicationUrl: process.env.APPLICATION_URL,
  adminEmail: process.env.ADMIN_EMAIL,
  applicationUrl: 'resilisense.org',
  adminDefaultPassword: process.env.ADMIN_DEFAULT_PASS,
  surveyMonkeyToken: process.env.SURVEY_MONKEY_TOKEN,
  appEmail: 'notifyme@carbon-lens.com',
  appMailPassword: 'piku@1234' , // '7Toolkit!@#',
  logger: {
    transports: {
      Console: {
        level: 'debug',
        handleExceptions: true,
        json: false,
        colorize: true,
      },
    },
  },
}
