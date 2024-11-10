
const graphql = require('graphql')
const {
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
} = graphql

const GapFileCriterionType = new GraphQLObjectType({
  name: 'GapFileCriterionType',
  fields: () => ({
    name: {
      type: GraphQLString,
    },
    value: {
      type: GraphQLInt,
    },
  }),
})

module.exports = GapFileCriterionType
