const nodeMaler = require('../services/nodeMaler')
const config = require('../config/keys')

exports.sendSupplierRequestEmail = function(req, res, next) {
  const email = req.body.email
  const company = req.body.companyName

  if (!email) {
    return res.status(422).send({error: 'You must provide an email'})
  }

  const mailOptions = {
    from: 'Resilisense <noreply@resilisense.com>', // sender address
    to: email, // list of receivers
    subject: 'New supplier request', // Subject line
    html: `<p>Dear Sir / Madam,</p>
    <p>You have received this email because you are a supplier of ${company}. ${company} considers that the only way to be sustainable is by managing their impacts across a range of issues, as well as the impacts of their supply chain. In this context ${company} are undertaking risk assessments of all of their suppliers on issues pertaining to human rights, organisational governance, environment, anti-corruption and anti-bribery, labour and operating practices, amongst others. ${company} are using The 7 Toolkit as the software of choice for this assessment. The aim of this assessment is to determine which suppliers are complying with the criteria they have set across this range of issues, to evaluate their existing collaborations.</p>
    
    <p>Please log in to your account on The 7 Toolkit, to complete the risk assessment for ${company}, at your earliest convenience. If you are not currently registered on The 7 Toolkit, you are requested to do so as soon as possible to be able to access the software and complete your risk assessment for ${company}. Please be informed that first-time users may be required to proceed to payment in order to access the platform.</p>    
    
    <p>To access The 7 Toolkit, please click <a href='https://${config.applicationUrl}/signin'>here</a> and follow the instructions provided. Once you register/log-in you will be requested to share your data with ${company} for the purposes of the risk assessment.</p>
    
    <p>For technical support to access The 7 Toolkit or any other enquiries please email info@seven-toolkit.com.</p>
    
    <p>Thank you for your participation!</p>
    
    <p>With best regards,</p>
    
    <p>The 7 Tookit Team</p>`, // html body
  }
  // add extra model to preserve pending requests!
  nodeMaler(mailOptions).catch(console.error)
  //respond to request indicating the request was sent
  res.json({message: 'Request send'})
}
