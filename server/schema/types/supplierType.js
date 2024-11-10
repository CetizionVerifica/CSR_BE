const graphql = require('graphql')
const {
  GraphQLObjectType,
  GraphQLList,
  GraphQLString,
} = graphql


const supplierType = new GraphQLObjectType({
  name: 'SupplierType',
  fields: () => ({
    id: {
      type: GraphQLString,
      resolve(supplier) {
        return supplier._id
      },
    },
    agency: {
      type: require('./agencyType'),
      async resolve(supplier) {
        return supplier.agency
      },
    },
    projects: {
      type: new GraphQLList(require('./projectType')),
      resolve(supplier) {
        return supplier.projects
      },
    },
  }),
})

module.exports = supplierType

