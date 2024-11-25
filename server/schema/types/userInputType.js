const graphql = require('graphql')
const UserModel = require('../../models/user')
const AgencyModel = require('../../models/agency')
const {
  GraphQLInputObjectType,
  GraphQLString,
  GraphQLNonNull,
  GraphQLFloat,
  GraphQLList,
  GraphQLID
} = graphql

const userInputType = new GraphQLInputObjectType({
  name: 'UserInputType',
  fields: {
    email: {type: new GraphQLNonNull(GraphQLString)},
    name: {type: new GraphQLNonNull(GraphQLString)},
    jobPosition: {type: GraphQLString},
    phone: {type: GraphQLString},
    extension: {type: GraphQLString},
    password: {type: GraphQLString},
    lisence: {type: new GraphQLList(GraphQLString)},
    fax: {type: GraphQLString},
    serviceProductInfo: {type: GraphQLString},
    percentageServiceProduct: {type: GraphQLString},
    country: {type: GraphQLString},
    sector: {type: GraphQLString},
    type: {type: GraphQLString},
    website: {type: GraphQLString},
    companies: { type: new GraphQLList(GraphQLString) }, // Companies as an array of IDs
    agencies: { type: new GraphQLList(GraphQLString ) }, // Agencies as an array of IDs
  },
})

module.exports = userInputType
