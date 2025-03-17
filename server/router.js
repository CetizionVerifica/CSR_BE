const passport = require('passport')
const jwt = require('jwt-simple')
const config = require('./config/keys')
const UserModel = require('./models/user')
const bodyParser = require('body-parser')
const Authentication = require('./controllers/authentication')
const Suppliers = require('./controllers/suppliers')
const Assessment = require('./controllers/assessment')
const Files = require('./controllers/files')
const Surveys = require('./controllers/surveys')
const Projects = require('./controllers/projects')
const ExternalSuppliers = require('./controllers/externalSuppliers')
const nodeMaler = require('./services/nodeMaler')
const upload = require('./services/upload')
const Logs = require('./controllers/logs')
const Gap = require('./controllers/gab');

require('./services/passport')

const requireAuth = passport.authenticate('jwt')
const requireSignin = passport.authenticate('local')

module.exports = function (app) {
  app.use(bodyParser.json({
    type: 'application/vnd.surveymonkey.response.v1+json',
  }))

  app.get('/api/current_user', async (req, res) => {
    const token = req.headers.authorization
    try {
      const decoded = jwt.decode(token, config.secretJWT)
      const user = await UserModel.findById(decoded.sub)
      res.send(user)
    } catch (error) {
      throw new Error(error)
    }

  })
  app.get('/api/check_authentication', async (req, res) => {
    const isAuthenticated = req.isAuthenticated()
    if (isAuthenticated) {
      res.status(200).json({ isAuthenticated: true })
    } else {
      res.status(401).json({ isAuthenticated: false })
    }
    // const token = req.headers.authorization
    // try {
    //   const decoded = jwt.decode(token, config.secretJWT)
    //   const user = await UserModel.findById(decoded.sub)
    //   res.send(user)
    // } catch (error) {
    //   throw new Error(error)
    // }
  })

  app.get('/api/projects/:year', requireAuth, Projects.getProjectsByYear);

  app.get('/api/logs', requireAuth, Logs.fetchLogs)

  app.post('/api/:projectId/file', requireAuth, upload, Files.uploadFile)
  app.delete('/api/file/:fileId', requireAuth, Files.deleteFile)
  app.post('/api/supplier_request', requireAuth, Suppliers.sendSupplierRequestEmail)

  // survey monkey
  app.get('/api/surveys', requireAuth, Surveys.getSurveys)
  app.post('/api/surveys/send', requireAuth, Surveys.sendSurvey)
  app.post('/api/surveys/:projectSurveyId/send', requireAuth, Surveys.sendReminder)
  app.post('/api/surveys/:projectSurveyId/close', requireAuth, Surveys.calculateSurveyResults)
  app.post('/api/surveys/receiveResponse/internal/:projectSurveyId', Surveys.receiveInternalResponse)
  app.head('/api/surveys/receiveResponse/internal/:projectSurveyId', Surveys.receiveResponseCheck)
  app.post('/api/surveys/receiveResponse/external/:projectSurveyId', Surveys.receiveExternalResponse)
  app.head('/api/surveys/receiveResponse/external/:projectSurveyId', Surveys.receiveResponseCheck)
  app.get('/api/surveys/:type(internal|external)', requireAuth, Surveys.getSurveyTemplateSample)

  // survey new endpoints:
  // ([0-9a-f]{24})
  app.patch('/api/surveys/answer', Surveys.updateSurveyAnswer);
  app.patch('/api/surveys/side/:sideid', Surveys.getSurveyBySideID);
  app.patch('/api/surveys/:surveyID([0-9a-f]{24})/complete', Surveys.completeSurvey);
  // app.post('/api/surveys/:projectSurveyId([0-9a-f]{24})/results', Surveys.calculateSurveyResults)

  app.post('/api/first_assessment_notify', requireAuth, Assessment.firstAssessmentNotificationEmail)
  app.post('/api/first_assessment_completed', requireAuth, Assessment.firstAssessmentCompletedEmail)
  app.post('/api/final_assessment_notify', requireAuth, Assessment.finalAssessmentNotificationEmail)
  app.post('/api/final_assessment_completed', requireAuth, Assessment.finalAssessmentCompletedEmail)

  app.post('/api/signin', requireSignin, Authentication.signin)
  app.post('/api/signup', Authentication.signup)
  app.get('/api/verify-email/:token/:newuser', Authentication.verifyEmail)
  app.get('/api/sendMail', (req, res) => {
    nodeMaler().catch(console.error)
    res.send(req.user)
  })

  app.get('/api/supplier/external/:agencyID', requireAuth, ExternalSuppliers.getExternalSuppliersByAgency);
  app.post('/api/supplier/external', requireAuth, ExternalSuppliers.addExternalSupplier);
  app.patch('/api/supplier/external', requireAuth, ExternalSuppliers.setHighSupplierConcern);
  app.put('/api/supplier/external/:supplierid([0-9a-f]{24})', requireAuth, ExternalSuppliers.editExternalSupplier);
  app.get('/api/activitylog/:companyId',requireAuth, ExternalSuppliers.activityLogController);
  app.post('/api/projects/gapanalysis',requireAuth, ExternalSuppliers.getProjectsGapAnalysis);

  // gap analysis
  app.get('/api/gapanalysis/:projectID([0-9a-f]{24})/:coreSubject/:issueOfInterest', requireAuth, Gap.getGabAnalysisByIssueInterestAndProjectID);
  // app.post('/api/finished_actionKpi_notify', requireAuth, Assessment.finished_actionKpi_notify)

}

