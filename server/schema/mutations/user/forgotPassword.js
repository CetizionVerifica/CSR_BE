const {
    GraphQLString, GraphQLBoolean,
  } = require('graphql')
  const jwt = require('jwt-simple')
  const nodeMaler = require('../../../services/nodeMaler')
  const UserModel = require('../../../models/user')
  const config = require('../../../config/keys')
  
  const {checkAuth} = require('../../../services/checkAuth')
  
  function tokenForUser(user) {
    const timestamp = new Date().getTime()
  
    return jwt.encode({sub: user.id, role: user.role, iat: timestamp}, config.secretJWT)
  }
  
  module.exports = {
    type: GraphQLBoolean,
    args: {
      email: {
          name: 'email',
          type: GraphQLString
      }
    },
    async resolve(root, params, context, options) {
    //   checkAuth(context.isAuthenticated())
      const user = await UserModel.findOne({ email: params.email })
      if (!user) {
        throw new Error('User does not exist')     
      }
      const mailOptions = {
        from: 'Resilisense <noreply@resilisense.com>', // sender address
        to: params.email, // list of receivers
        subject: 'Request changing password', // Subject line
        //text: 'Hello world?', // plain text body
     
        html: `<p>Dear Sir / Madam,</p>
        <p>You have received this email because you have requested changed password.</p>
        
        <p>Please go to <a href='https://resilisense.org/api/verify-email/${tokenForUser(user)}/0'>here</a> to change your password.</p>
        
        <p>For technical support to access The 7 Toolkit or any other enquiries please email info@seven-toolkit.com.</p>
        
        <p>Thank you for your participation!</p>
        
        <p>With best regards,</p>
        
        <p>The 7 Tookit Team</p>`, // html body
     
    
      }

      nodeMaler(mailOptions).catch(console.error) 
      return true
    }
  }
  
  