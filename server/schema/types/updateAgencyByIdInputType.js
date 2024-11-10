const graphql = require('graphql')
const {
  GraphQLInputObjectType,
  GraphQLString,
  GraphQLNonNull,
  GraphQLList,
  GraphQLID
} = graphql

const updateAgencyByIdInputType = new GraphQLInputObjectType({
  name: 'updateAgencyByIdInputType',
  fields: {
    users: {type: new GraphQLList(GraphQLID)},
    companies: {type: new GraphQLList(GraphQLID)},
    projects: {type: new GraphQLList(GraphQLID)},
  },
})
module.exports = updateAgencyByIdInputType


