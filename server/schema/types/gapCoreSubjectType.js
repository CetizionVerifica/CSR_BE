const graphql = require('graphql')
const {
  GraphQLObjectType,
  GraphQLList,
  GraphQLString,
  GraphQLNonNull,
  GraphQLFloat,
} = graphql
const GapIssueOfInerestType = require('./gapIssueOfInerestType')

const GapCoreSubjectType = new GraphQLObjectType({
  name: 'GapCoreSubjectType',
  fields: () => ({
    coreSubject: {type: new GraphQLNonNull(GraphQLString)},
    issueOfInterests: {type: GraphQLList(GapIssueOfInerestType)},
    performanceValue: {type: GraphQLFloat},
    relevanceValue: {type: GraphQLFloat},
    relevanceWeightValue: {type: GraphQLFloat},
    revisedWeightValue: {type: GraphQLFloat},
    revisedScore  : {type: GraphQLFloat},


    WeightValue: {type: GraphQLFloat},
    totalKeyConsiderations: {type: GraphQLFloat},
  }),
})

module.exports = GapCoreSubjectType
