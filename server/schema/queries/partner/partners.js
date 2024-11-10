const {GraphQLString} = require('graphql')
const AgencyType = require('../../types/agencyType')
const AgencyModel = require('../../../models/agency')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: AgencyType,
  args: {
    id: {
      name: 'id',
      type: GraphQLString,
    },
  },
  async resolve(parentValue, params, context, options) {
    checkAuth(context.isAuthenticated())

    let id = params.id
    if (!id) {
      throw new Error('Error  agency')
    }

    const agency = await AgencyModel.findAgencyPartners(id)

    return agency
  },
}
