const graphql = require('graphql')
const {
  GraphQLInputObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLID,
  GraphQLNonNull,
} = graphql

const userCompanyInputType = new GraphQLInputObjectType({
  name: 'UserCompanyInputType',
  fields: {
    user: {type: new GraphQLNonNull(GraphQLID)},
    permission: {type: new GraphQLNonNull(GraphQLString)},
    projects: {type: GraphQLList(GraphQLID)},
  },
})

module.exports = userCompanyInputType

