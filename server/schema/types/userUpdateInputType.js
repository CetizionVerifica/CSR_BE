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
    active: { type: GraphQLBoolean},
    agencies: { type: new GraphQLList(GraphQLID)}
  },
})

module.exports = userUpdateInputType
