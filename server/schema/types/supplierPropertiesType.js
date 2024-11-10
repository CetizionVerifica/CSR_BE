const graphql = require('graphql')
const {
  GraphQLObjectType,
  GraphQLString,
  GraphQLBoolean,
} = graphql


const supplierPropertiesType = new GraphQLObjectType({
  name: 'SupplierPropertiesType',
  fields: () => ({
    supplier: {
      type: GraphQLString,
      resolve(supplierProperties) {
        return supplierProperties.supplier
      },
    },
    fullAccessToResults: {
      type: GraphQLBoolean,
      resolve(supplierProperties) {
        return supplierProperties.fullAccessToResults
      },
    },
    physicalAudit: {
      type: GraphQLBoolean,
      resolve(supplierProperties) {
        return supplierProperties.physicalAudit
      },
    },
  }),
})

module.exports = supplierPropertiesType

