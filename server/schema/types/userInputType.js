const graphql = require('graphql')
const {
  GraphQLInputObjectType,
  GraphQLString,
  GraphQLNonNull,
} = graphql

const userInputType = new GraphQLInputObjectType({
  name: 'UserInputType',
  fields: {
    email: {type: new GraphQLNonNull(GraphQLString)},
    name: {type: new GraphQLNonNull(GraphQLString)},
    jobPosition: {type: GraphQLString},
    phone: {type: GraphQLString},
    extension: {type: GraphQLString},

  },
})

module.exports = userInputType
