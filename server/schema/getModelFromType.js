const CompanyModel = require('../models/company')
const ProjectModel = require('../models/project')
const AgencyModel = require('../models/agency')
const EmployeeModel = require('../models/employee')
const StakeholderModel = require('../models/stakeholder')
const MaterialityModel = require('../models/materiality')
const GapAnalysisModel = require('../models/gapAnalysis')
const GapFileModel = require('../models/gapFile')
const ActionsAndKPIsModel = require('../models/actionsAndKPIs')
const SurveyModel = require('../models/survey')

module.exports = async(type) => {
  switch (type) {
    case 'company':
      return CompanyModel
    case 'project':
      return ProjectModel
    case 'agency':
      return AgencyModel
    case 'employee':
      return EmployeeModel
    case 'stakeholder':
      return StakeholderModel
    case 'materiality':
      return MaterialityModel
    case 'gapAnalysis':
      return GapAnalysisModel
    case 'gapFile':
      return GapFileModel
    case 'actionsAndKPIs':
      return ActionsAndKPIsModel
    case 'survey':
      return SurveyModel
    default:
      return null
  }
}
