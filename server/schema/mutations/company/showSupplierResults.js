const {
  GraphQLNonNull,
  GraphQLID,
  GraphQLBoolean,
} = require('graphql')
const AgencyType = require('../../types/agencyType')
const AgencyModel = require('../../../models/agency')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: AgencyType,
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
    show: {
      name: 'show',
      type: GraphQLBoolean,
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const update = params.show ?
      {$addToSet: {'partners.$.showProjectResults': params.projectId}} :
      {$pull: {'partners.$.showProjectResults': params.projectId}}

    const agency = await AgencyModel.findOneAndUpdate({'_id': params.id, 'partners._id': params.partnerId},
      update)

    if (!agency) {
      throw new Error('Error agency not found')
    }

    return agency
  },
}
