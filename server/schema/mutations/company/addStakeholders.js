const {
  GraphQLNonNull,
  GraphQLID,
  GraphQLList,
} = require('graphql')
const getProjection = require('../../../helpers/getProjection')
const StakeholderInputType = require('../../types/stakeholderInputType')
const StakeholderModel = require('../../../models/stakeholder')
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
      type: new GraphQLList(GraphQLNonNull(StakeholderInputType)),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const company = await CompanyModel.findById(params.id)
    if (!company) {
      throw new Error('Error company not found')
    }

    try {
      await params.data.map(async record => {
        const stakeholderData = Object.assign({}, record)
        const stakeholderModel = new StakeholderModel({...stakeholderData, company})
        const stakeholder = await stakeholderModel.save()

        if (!stakeholder) {
          throw new Error('Error creating stakeholder')
        }
        await updateItem({
          id: params.id,
          type: 'company',
          changes: {stakeholders: [...company.stakeholders, stakeholder]},
          projection,
          userId: root.user._id,
        })
      })
    } catch (error) {
      throw new Error('Error creating stakeholders')
    }

    return company
  },
}
