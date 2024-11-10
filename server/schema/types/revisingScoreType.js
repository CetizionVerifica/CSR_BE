const graphql = require('graphql')
const {
  GraphQLInputObjectType,
  GraphQLString,
  GraphQLFloat,
} = graphql

const RevisingScoreType = new GraphQLInputObjectType({
  name: 'RevisingScoreType',
  fields: () => ({
    keyConsideration: {type: GraphQLString},
    score: {type: GraphQLFloat},
  }),
})

module.exports = RevisingScoreType
