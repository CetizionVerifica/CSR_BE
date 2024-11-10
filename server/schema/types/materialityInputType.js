const graphql = require('graphql')
const {
  GraphQLInputObjectType,
  GraphQLID,
  GraphQLInt,
  GraphQLNonNull,
} = graphql

const MaterialityInputType = new GraphQLInputObjectType({
  name: 'MaterialityInputType',
  fields: () => ({
    id: {type: GraphQLID},
    weight: {type: new GraphQLNonNull(GraphQLInt)},
  }),
})

module.exports = MaterialityInputType
