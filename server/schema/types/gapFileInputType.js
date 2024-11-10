
const graphql = require('graphql')
const {
  GraphQLInputObjectType,
  GraphQLString,
  GraphQLNonNull,
  GraphQLInt,
} = graphql


const gapFileInputType = new GraphQLInputObjectType({
  name: 'gapFileInputType',
  fields: () => ({
    name: {type: new GraphQLNonNull(GraphQLString)},
    value: {type: GraphQLInt},
  }),
})

module.exports = gapFileInputType
