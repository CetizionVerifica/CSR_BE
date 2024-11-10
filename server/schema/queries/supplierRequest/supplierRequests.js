const {GraphQLList, GraphQLString} = require('graphql')
const SupplierRequestType = require('../../types/supplierRequestType')
const SupplierRequestModel = require('../../../models/supplierRequest')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: new GraphQLList(SupplierRequestType),
  args: {
    email: {
      name: 'email',
      type: GraphQLString,
    },
  },
  resolve(parentValue, params, context, options) {
    checkAuth(context.isAuthenticated())

    if (!params.email) {
      throw new Error('Error with supplier request email')
    }

    return SupplierRequestModel.find({email: params.email}).exec()
  },
}
