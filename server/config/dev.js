const { mongoURI } = require("./prod");

//eslint-disable-this-file
module.exports = {
  googleClientID:
    '828082854480-4m5heb9dk0gueauf1u2eet3ejsnvr9da.apps.googleusercontent.com',
  googleClientSecret: 'aWzndAHfEDbErbGMZpssoPGn',
  // mongoURI: 'mongodb://10.10.0.8:27017/csr-prod2',
  mongoURI: "mongodb+srv://shyam:piku1234@cluster0.b741l.mongodb.net/csr?retryWrites=true&w=majority",
  cookieKey: 'ffmkerfkemkfmrferfioerfio',
  stripePublishableKey: 'pk_test_acoUiwMZ1KafM5TbFEZ88MYx',
  stripeSecretKey: 'sk_test_n1LCKn93vrwC9HXzpOH80mKI',
  sendGridKey: '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',
  redirectDomain: 'test.seven-toolkit.com',
  secretJWT: 'dsfdsfskfsklljfjjkjk32323lsjjljlljjk',
  secretSession: 'dsfsdldsfdsfsdfsfsdfsdfdsf',
  applicationUrl: 'resilisense.org',
  url:'https://resilisense.org',
  adminEmail: 'admin@admin.com',
  adminDefaultPassword: '123456',
  appEmail: 'noreply@seven-toolkit.com',
  appMailPassword: '',
  surveyMonkeyToken:'hKFo2SBkUktVTWs4VVFMeUZKd1hOREtCeXpUMkZZN1k1aVhfVKFupWxvZ2luo3RpZNkgSFlyWG5tZDNOenRSMlZDTF9UV0F3a2lzVEYyc2c5MVqjY2lk2SBzQTM0RFVtUUE0RUlySkM3cTlRdVBDZjFUNzc4QmZMdg',
  // surveyMonkeyToken:"6FrUKDGf4uYmelpyP6LeDYmrQg-gy4wbdKlew7C8Q.Iv3hIamhx-F2wcaLs.axdMIx.W-ED53Jti1DO2oMtjqe-hr9w.KQs.RP5qjM0sf4fJl-tJ7gOdWhmspnE30PvE", //process.env.SURVEY_MONKEY_TOKEN,
  logger: {
    transports: {
      Console: {
        level: "debug",
        handleExceptions: true,
        json: false,
        colorize: true,
      },
    },
  },
};

/*
  <add key="GOOGLE_CLIENT_ID" value="828082854480-4m5heb9dk0gueauf1u2eet3ejsnvr9da.apps.googleusercontent.com" />
  <add key="GOOGLE_CLIENT_SECRET" value="aWzndAHfEDbErbGMZpssoPGn" />
  <add key="MONGO_URI" value="mongodb://localhost:27017/csr_dev" />
  <add key="COOKIE_KEY" value="ffmkerfkemkfmrferfioerfio" />
  <add key="STRIPE_PUBLISHABLE_KEY" value="pk_test_acoUiwMZ1KafM5TbFEZ88MYx" />
  <add key="STRIPE_SCERET_KEY" value="sk_test_n1LCKn93vrwC9HXzpOH80mKI" />
  <add key="SEND_GRID_KEY" value="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" />
<add key="REDIRCT_DOMAIN" value="test.seven-toolkit.com" />
  <add key="SCERET_JWT" value="dsfdsfskfsklljfjjkjk32323lsjjljlljjk" />
  <add key="SESSION_SECRET" value="dsfsdldsfdsfsdfsfsdfsdfdsf" />
  <add key="APPLICATION_URL" value="test.seven-toolkit.com" />
  <add key="ADMIN_EMAIL" value="admin@admin.com" />
  <add key="ADMIN_DEFAULT_PASS" value="123456" />
  <add key="SURVEY_MONKEY_TOKEN" value="6FrUKDGf4uYmelpyP6LeDYmrQg-gy4wbdKlew7C8Q.Iv3hIamhx-F2wcaLs.axdMIx.W-ED53Jti1DO2oMtjqe-hr9w.KQs.RP5qjM0sf4fJl-tJ7gOdWhmspnE30PvE" />	*/
