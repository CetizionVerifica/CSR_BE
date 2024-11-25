const graphql = require('graphql')
const {
  GraphQLInputObjectType,
  GraphQLString,
  GraphQLNonNull,
  GraphQLList,
  GraphQLID,
  GraphQLBoolean
} = graphql

const userUpdateInputType = new GraphQLInputObjectType({
  name: 'userUpdateInputType',
  fields: {
    email: {type: GraphQLString},
    name: {type: GraphQLString},
    jobPosition: {type: GraphQLString},
    phone: {type: GraphQLString},
    website: {type: GraphQLString},
    sector: {type: GraphQLString},
    type: {type: GraphQLString},
    serviceProductInfo: {type: GraphQLString},
    percentageServiceProduct: {type: GraphQLString},
    country: {type: GraphQLString},
    lisence: {type: new GraphQLList(GraphQLString)},
    fax: {type: GraphQLString},
    password: {type: GraphQLString},
    active: { type: GraphQLBoolean},
    agencies: { type: new GraphQLList(GraphQLID)},
    companies: { type: new GraphQLList(GraphQLID) }
  },
})

module.exports = userUpdateInputType
