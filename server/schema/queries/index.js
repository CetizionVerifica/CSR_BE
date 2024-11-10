const user = require('./user')
const agency = require('./agency')
const supplier = require('./supplier')
const partner = require('./partner')
const company = require('./company')
const project = require('./project')
const employee = require('./employee')
const stakeholder = require('./stakeholder')
const gapAnalysis = require('./gapAnalysis')
const gapFile = require('./gapFile')
const materiality = require('./materiality')
const actionsAndKPIs = require('./actionsAndKPIs')
const survey = require('./survey')
const projectSurvey = require('./projectSurvey')

module.exports = {
  ...user,
  ...company,
  ...project,
  ...employee,
  ...stakeholder,
  ...gapAnalysis,
  ...gapFile,
  ...materiality,
  ...actionsAndKPIs,
  ...agency,
  ...supplier,
  ...partner,
  ...survey,
  ...projectSurvey,
}
