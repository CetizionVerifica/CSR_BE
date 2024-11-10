const {
  GraphQLNonNull,
  GraphQLID,
} = require('graphql')
const getProjection = require('../../../helpers/getProjection')
const ActionsAndKPIsInputType = require('../../types/actionsAndKPIsInputType')
const ActionsAndKPIsModel = require('../../../models/actionsAndKPIs')
const CompanyType = require('../../types/companyType')
const CompanyModel = require('../../../models/company')
const updateItem = require('../_helper/updateItem')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: CompanyType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    data: {
      name: 'data',
      type: new GraphQLNonNull(ActionsAndKPIsInputType),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const company = await CompanyModel.findById(params.id)
    if (!company) {
      throw new Error('Error company not found')
    }
    const actionsAndKPIsData = Object.assign({}, params.data)
    actionsAndKPIsData.createdBy = root.user._id
    actionsAndKPIsData.updatedBy = root.user._id
    actionsAndKPIsData.projectPerformance = {
      project: actionsAndKPIsData.projectId,
      performance: actionsAndKPIsData.baselinePerformance,
      targetPerformance: actionsAndKPIsData.targetPerformance,
      year: actionsAndKPIsData.year,
      isBaseline: true,
    }
    const actionsAndKPIsModel = new ActionsAndKPIsModel({...actionsAndKPIsData, company})
    const actionsAndKPIs = await actionsAndKPIsModel.save()

    if (!actionsAndKPIs) {
      throw new Error('Error creating actions And KPIs')
    }

    const {item} = await updateItem({
      id: params.id,
      type: 'company',
      changes: {actionsAndKPIs: [...company.actionsAndKPIs || [], actionsAndKPIs]},
      projection,
      userId: root.user._id,
    })
    return item
  },
}
