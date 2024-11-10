const {
  GraphQLNonNull,
  GraphQLID,
} = require('graphql')
const getProjection = require('../../../helpers/getProjection')
const MaterialityInputType = require('../../types/materialityInputType')
const MaterialityModel = require('../../../models/materiality')
const ProjectType = require('../../types/projectType')
const ProjectModel = require('../../../models/project')
const StakeholderModel = require('../../../models/stakeholder')
const updateItem = require('../_helper/updateItem')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: ProjectType,
  args: {
    projectId: {
      name: 'projectId',
      type: new GraphQLNonNull(GraphQLID),
    },
    stakeholderId: {
      name: 'stakeholderId',
      type: new GraphQLNonNull(GraphQLID),
    },
    data: {
      name: 'data',
      type: new GraphQLNonNull(MaterialityInputType),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const project = await ProjectModel.findById(params.projectId)
    if (!project) {
      throw new Error('Error project not found')
    }
    const stakeholder = await StakeholderModel.findById(params.stakeholderId)
    if (!stakeholder) {
      throw new Error('Error stakeholder not found')
    }
    const materialityData = Object.assign({}, params.data)
    const materialityModel = new MaterialityModel({...materialityData, project, stakeholder})
    const materiality = await materialityModel.save()

    if (!materiality) {
      throw new Error('Error creating materiality')
    }

    const {item} = await updateItem({
      id: params.projectId,
      type: 'project',
      changes: {materiality: [...project.materiality, materiality]},
      projection,
      userId: root.user._id,
    })
    return item
  },
}
