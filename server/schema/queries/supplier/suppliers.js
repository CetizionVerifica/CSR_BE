const {GraphQLList, GraphQLString} = require('graphql')
const CompanyType = require('../../types/companyType')
const CompanyModel = require('../../../models/company')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: new GraphQLList(CompanyType),
  args: {
    id: {
      name: 'id',
      type: GraphQLString,
    },
  },
  resolve(parentValue, params, context, options) {
    checkAuth(context.isAuthenticated())

    let id = params.id
    if (!id) {
      return []
    }

    return CompanyModel.findAgencySuppliers(id)
  },
}
