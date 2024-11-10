const graphql = require('graphql')
const {
  GraphQLObjectType,
  GraphQLInt,
  GraphQLList,
} = graphql
const CompanyModel = require('../../models/company')

const supplierRequestsType = new GraphQLObjectType(
  {name: 'SupplierRequestsType',
    fields: () => ({
      company: {
        type: require('./companyType'),
        resolve(parentValue) {
          return CompanyModel.findById(parentValue.partners.company)
            .then(company => {
              return company
            })
        },
      },
      partnerRequestedProjects: {
        type: new GraphQLList(require('./projectType')),
        resolve(parentValue) {
          return parentValue.partners.partnerRequestedProjects
        },
      },
      requestedYears: {
        type: new GraphQLList(GraphQLInt),
        resolve(parentValue) {
          return parentValue.partners.requestedYears
        },
      },
    }),
  })

module.exports = supplierRequestsType

