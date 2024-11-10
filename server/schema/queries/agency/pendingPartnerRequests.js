const {GraphQLList} = require('graphql')
const SupplierRequestsType = require('../../types/supplierRequestsType')
const AgencyModel = require('../../../models/agency')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: new GraphQLList(SupplierRequestsType),
  args: {
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    let id = root.user.currentAgency
    if (!id) {
      throw new Error('Error  agency')
    }

    const result = await AgencyModel.aggregate([
      {$match: {
        '_id': id,
        'partners': {$exists: true, $not: {$size: 0}},
        'partners.partnerRequestedProjects': {$exists: true, $not: {$size: 0}},
      }},
      {$unwind: '$partners'},
      {$project: {
        partners: 1,
      }},
    ]).exec()

    return result
  },
}
