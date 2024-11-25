const graphql = require('graphql')
const {
  GraphQLInputObjectType,
  GraphQLID,
  GraphQLString,
  GraphQLFloat,
  GraphQLNonNull,
  GraphQLList,
} = graphql

const companyInputType = new GraphQLInputObjectType({
  name: 'CompanyInputType',
  fields: {
    name: {type: new GraphQLNonNull(GraphQLString)},
    email: {type: GraphQLString},
    website: {type: GraphQLString},
    country: {type: GraphQLString},
    sector: {type: GraphQLString},
    type: {type: GraphQLString},
    serviceProductInfo: {type: GraphQLString},
    percentageServiceProduct: {type: GraphQLString},
    lisence: {type: new GraphQLList(GraphQLString)},
    reseller: {type: GraphQLString},
    users: {type: new GraphQLList(GraphQLString)},
    phone: {type: GraphQLString},
    fax: {type: GraphQLString},
    personName: {type: new GraphQLNonNull(GraphQLString)},
    jobPosition: {type: new GraphQLNonNull(GraphQLString)},
    personEmail: {type: new GraphQLNonNull(GraphQLString)},
    personPhone: {type: GraphQLString},
    personExtetion: {type: GraphQLString},
    personFax: {type: GraphQLString},
    internalEmailTemplate: {type: GraphQLString},
    internalReminderEmailTemplate: {type: GraphQLString},
    externalEmailTemplate: {type: GraphQLString},
    externalReminderEmailTemplate: {type: GraphQLString},
    password: {type: GraphQLString},
    date: {
      type: GraphQLFloat,
      default: Date.now,
    },
    updatedDate: {
      type: GraphQLFloat,
      default: Date.now,
    },
    updatedBy: {type: GraphQLID},
    createdBy: {type: GraphQLID},
  },
})

module.exports = companyInputType
