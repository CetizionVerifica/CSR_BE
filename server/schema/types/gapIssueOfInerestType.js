const graphql = require('graphql')
const {
  GraphQLObjectType,
  GraphQLList,
  GraphQLString,
  GraphQLNonNull,
  GraphQLFloat,
} = graphql

const GapkeyConsiderationType = require('./gapkeyConsiderationType')

const GapIssueOfInterestType = new GraphQLObjectType({
  name: 'GapIssueOfInterest',
  fields: () => ({
    issueOfInterest: {type: new GraphQLNonNull(GraphQLString)},
    keyConsiderations: {type: GraphQLList(GapkeyConsiderationType)},
    performanceValue: {type: GraphQLFloat},
    relevanceValue: {type: GraphQLFloat},
    relevanceWeightValue: {type: GraphQLFloat},
    revisedWeightValue: {type: GraphQLFloat},
    revisedScore: {type: GraphQLFloat},
    customField: { type: new GraphQLList(GraphQLFloat)},
    extraCustomField: { type: new GraphQLList(GraphQLFloat)},
    WeightValue: {type: GraphQLFloat},
  }),
})

module.exports = GapIssueOfInterestType
