const graphql = require('graphql')
const {
  GraphQLObjectType,
  GraphQLInt,
  GraphQLString,
} = graphql


const supplierRequestType = new GraphQLObjectType({
  name: 'SupplierRequestType',
  fields: () => ({
    id: {
      type: GraphQLString,
      resolve(supplierRequest) {
        return supplierRequest._id
      },
    },
    email: {
      type: GraphQLString,
    },
    company: {
      type: require('./companyType'),
      async resolve(supplierRequest) {
        return supplierRequest.company
      },
    },
    requestedYear: {
      type: GraphQLInt,
      resolve(supplierRequest) {
        return supplierRequest.requestedYear
      },
    },
  }),
})

module.exports = supplierRequestType

