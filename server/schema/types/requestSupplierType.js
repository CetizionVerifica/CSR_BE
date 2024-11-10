const graphql = require('graphql')
const {
  GraphQLInputObjectType,
  GraphQLString,
  GraphQLInt,
} = graphql

const RequestSupplierType = new GraphQLInputObjectType({
  name: 'RequestSupplierType',
  fields: {
    id: {type: GraphQLString},
    agencyId: {type: GraphQLString},
    companyId: {type: GraphQLString},
    projectId: {type: GraphQLString},
    requestedYear: {type: GraphQLInt},
  },
})

module.exports = RequestSupplierType
