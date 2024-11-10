const CompanyModel = require('../models/company')
const nodeMaler = require('../services/nodeMaler')
const config = require('../config/keys')

exports.firstAssessmentNotificationEmail = function(req, res, next) {
  const company = req.body.companyName

  if (!company) {
    return res.status(422).send({error: 'You must provide a company'})
  }

  // Email to assessor
  const mailOptions = {
    from: 'Resilisense <noreply@resilisense.com>', // sender address
    to: 'info@csranalyticsprotoolkit.com', // list of receivers
    subject: 'Documentation Upload Completed – Documentation ready for First Documentation Assessment', // Subject line
    html: `<p>Dear assessor,</p>
    <p>The first round of documentation has now been submitted by ${company}
    and is ready to be assessed as part of the First Documentation Assessment process. To
    proceed to the Documentation Assessment Portal, where you will be able to assess the
    documentation submitted, please press <a href='https://${config.applicationUrl}/signin'>here</a> and enter your login details.</p>
    
    <p>In the case that you require support or guidance on the above, please contact info@seven-toolkit.com.</p>
    
    <p>Best regards,</p>
    
    <p>The 7 Tookit Team</p>`, // html body
  }
  // add extra model to preserve pending requests!
  nodeMaler(mailOptions).catch(console.error)

  //respond to request indicating the request was sent
  res.json({message: 'Notification send'})
}

exports.firstAssessmentCompletedEmail = function(req, res, next) {
  const email = req.body.email
  const company = req.body.companyName

  if (!email) {
    return res.status(422).send({error: 'You must provide an email'})
  }

  // Email to company
  const mailOptions = {
    from: 'Resilisense<noreply@resilisense.com>', // sender address
    to: email, // list of receivers
    subject: 'First Documentation Assessment Completed – Documentation Assessment Report available for review', // Subject line
    html: `<p>Dear ${company},</p>
    <p>The first assessment of the documentation you have provided has now been completed. The
    First Documentation Assessment Report is now available for users to review in the
    Documentation Assessment page, found under the Gap Analysis feature of the 7 Toolkit
    platform. You are now allowed to upload outstanding documentation or upload updated
    documentation if absolutely necessary. It is advised to avoid revising existing documentation by
    incorporating assessment feedback, as this is considered untruthful and is identifiable by the
    assessment criteria that are used by the 7 Toolkit. Any such documentation will be rejected.</p>
    
    <p>After all revisions have been made, users can re-submit for a second documentation
    assessment, that will be final. With the completion of the final documentation assessment, the
    Final Documentation Assessment Report will be available for all users to view. Resubmissions
    will not be allowed from that point onwards, meaning the results of the report will be final and
    the scores achieved will be unalterable. Users will then be able to proceed to the Results page
    of the Gap Analysis feature of the 7 Toolkit, where visual representations and analytics will be
    provided based on users’ data input and the corresponding revisions made through the
    documentation assessment process.</p>
    
    <p>Best regards,</p>
    
    <p>The 7 Tookit Team</p>`, // html body
  }

  nodeMaler(mailOptions).catch(console.error)

  //respond to request indicating the request was sent
  res.json({message: 'Notification send'})
}

exports.finalAssessmentNotificationEmail = function(req, res, next) {
  const company = req.body.companyName

  if (!company) {
    return res.status(422).send({error: 'You must provide a company'})
  }

  // Email to assessor
  const mailOptions = {
    from: 'Resilisense<noreply@resilisense.com>', // sender address
    to: 'info@csranalyticsprotoolkit.com',
    subject: 'Documentation Upload Completed – Documentation ready for Final Documentation Assessment', // Subject line
    html: `<p>Dear assessor,</p>
    <p>The final round of documentation has now been submitted by ${company} 
    and is ready to be assessed as part of the Final Documentation Assessment process. To
    proceed to the Documentation Assessment Portal, where you will be able to assess the
    documentation submitted, please press <a href='https://${config.applicationUrl}/signin'>here</a> and enter your login details.</p>
    
    <p>In the case that you require support or guidance on the above, please contact info@seven-toolkit.com.</p>
    
    <p>Best regards,</p>
    
    <p>The 7 Tookit Team</p>`, // html body
  }
  // add extra model to preserve pending requests!
  nodeMaler(mailOptions).catch(console.error)

  //respond to request indicating the request was sent
  res.json({message: 'Notification send'})
}

exports.finalAssessmentCompletedEmail = function(req, res, next) {
  const email = req.body.email
  const company = req.body.companyName
  const project = req.body.projectId

  if (!email) {
    return res.status(422).send({error: 'You must provide an email'})
  }

  // Email to company
  const mailOptions = {
    from: 'Resilisense<noreply@resilisense.com>', // sender address
    to: email, // list of receivers
    subject: 'Final Documentation Assessment Completed – Documentation Assessment Report available', // Subject line
    html: `<p>Dear ${company},</p>
    <p>The final assessment of the documentation you have provided has now been completed. The
    Final Documentation Assessment Report is now available for users to review in the
    Documentation Assessment page, found under the Gap Analysis feature of the 7 Toolkit. Given
    this is the final report, users are not allowed to make resubmissions or new submissions.
    Results and scores presented in this report are final and unalterable. Users can now proceed to
    the Results page of the Gap Analysis feature of the 7 Toolkit, where visual representations and
    analytics will be provided based on users’ data input and the corresponding revisions made
    through the documentation assessment process.</p>
    
    <p>Best regards,</p>
    
    <p>The 7 Tookit Team</p>`, // html body
  }
  // add extra model to preserve pending requests!
  nodeMaler(mailOptions).catch(console.error)

  CompanyModel.findProjectSuppliers(project).then(suppliers => {
    suppliers.forEach(supplier => {
      const supplierMailOptions = {
        from: 'Resilisense <noreply@resilisense.com', // sender address
        to: supplier.email, // list of receivers
        subject: 'Supplier Evaluation Completed – Supplier ready for including in Supplier Ranking exercise', // Subject line
        html: `<p>Dear ${supplier.name},</p>
        
        <p>The final assessment of the documentation provided by your supplier ${company} has now been completed. 
        The supplier’s final results have been calculated and it is therefore possible to include the supplier in your Supplier Ranking exercise.</p>        
        
        <p>Best regards,</p>
        
        <p>The 7 Tookit Team</p>`, // html body
      }
      // add extra model to preserve pending requests!
      nodeMaler(supplierMailOptions).catch(console.error)
    })


    //respond to request indicating the request was sent
    //respond to request indicating the request was sent
    res.json({message: 'Notification send'})
  })
}
