const {
  GraphQLString,
  GraphQLID,
  GraphQLInt,
} = require('graphql')
const SupplierRequestType = require('../../types/supplierRequestType')
const SupplierRequestModel = require('../../../models/supplierRequest')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: SupplierRequestType,
  args: {
    email: {
      name: 'email',
      type: GraphQLString,
    },
    type: {
      name: 'type',
      type: GraphQLString,
    },
    company: {
      name: 'company',
      type: GraphQLID,
    },
    requestedYear: {
      name: 'requestedYear',
      type: GraphQLInt,
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    if (!params.email || !params.company || !params.requestedYear) {
      throw new Error('Error with supplier request')
    }

    const supplierRequestModel = new SupplierRequestModel({
      ...params,
    })

    const supplierRequest = await supplierRequestModel.save()

    return supplierRequest
  },
}
