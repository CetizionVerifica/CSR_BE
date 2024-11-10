const {
  GraphQLNonNull,
  GraphQLID,
} = require('graphql')
const CompanyType = require('../../types/companyType')
const AgencyModel = require('../../../models/agency')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: CompanyType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    partnerId: {
      name: 'partnerId',
      type: GraphQLID,
    },
    projectId: {
      name: 'projectId',
      type: GraphQLID,
    },

  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const agency = await AgencyModel.findOneAndUpdate({'_id': params.id, 'partners._id': params.partnerId},
      {$pull: {'partners.$.partnerRequestedProjects': params.projectId}}).exec()

    if (!agency) {
      throw new Error('Error agency not found')
    }

    return agency
  },
}
