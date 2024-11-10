const {
  GraphQLNonNull,
  GraphQLID,
} = require('graphql')
const getProjection = require('../../../helpers/getProjection')
const ProjectInputType = require('../../types/projectInputType')
const ProjectType = require('../../types/projectType')
const ProjectModel = require('../../../models/project')
const CompanyModel = require('../../../models/company')
const MaterialityModel = require('../../../models/materiality')
const GapAnalysisModel = require('../../../models/gapAnalysis')
const StakeholderModel = require('../../../models/stakeholder')
const AgencyModel = require('../../../models/agency')
const updateItem = require('../_helper/updateItem')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: ProjectType,
  args: {
    companyId: {
      name: 'companyId',
      type: new GraphQLNonNull(GraphQLID),
    },
    data: {
      name: 'data',
      type: new GraphQLNonNull(ProjectInputType),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const company = await CompanyModel.findById(params.companyId)

    if (!company) {
      throw new Error('Error cant find company')
    }

    let stakeholder = await StakeholderModel.findOne({company: params.companyId, isCompany: true})

    if (!stakeholder) {
      const stakeholderRecord = {
        isCompany: true,
        name: company.name,
        companyName: company.name,
        email: company.personEmail,
        jobPosition: company.jobPosition,
      }
      const stakeholderModel = new StakeholderModel({...stakeholderRecord, company})
      stakeholder = await stakeholderModel.save()
    }
    const projectData = Object.assign({}, params.data)

    projectData.createdBy = root.user._id
    projectData.updatedBy = root.user._id
    projectData.agency = company.agency


    const projectModel = new ProjectModel({...projectData, company})
    const project = await projectModel.save()

    if (!project) {
      throw new Error('Error creating project')
    }
    const gapAnalysisRecord = {coreSubjects: []}
    gapAnalysisRecord.createdBy = root.user._id
    gapAnalysisRecord.updatedBy = root.user._id

    const gapAnalysisModel = new GapAnalysisModel({
      ...gapAnalysisRecord,
      project,
    })
    const gapAnalysis = await gapAnalysisModel.save()

    if (!gapAnalysis) {
      throw new Error('Error creating gapAnalysis')
    }

    const materialityRecord = {stakeholders: [{
      stakeholder,
      isCompany: true,
      credits: 250, // need to move to config
      weightValue: 0.5,
    }]}
    materialityRecord.createdBy = root.user._id
    materialityRecord.updatedBy = root.user._id
    const materialityModel = new MaterialityModel({
      ...materialityRecord,
      project,
    })
    const materiality = await materialityModel.save()

    if (!materiality) {
      throw new Error('Error creating materiality')
    }

    await updateItem({
      id: params.companyId,
      type: 'company',
      changes: {projects: [...company.projects, project]},
      projection,
      userId: root.user._id,
    })
    const {item} = await updateItem({
      id: project.id,
      type: 'project',
      changes: {materiality: materiality, gapAnalysis: gapAnalysis},
      projection,
      userId: root.user._id,
    })
    const agency = await AgencyModel.findById(company.agency)

    if (!agency) {
      throw new Error('Error cant find agency')
    }
    await updateItem({
      id: company.agency ,
      type: 'agency',
      changes: {projects: [...agency.projects, project]},
      projection,
      userId: root.user._id,
    })
    return item
  },
}
