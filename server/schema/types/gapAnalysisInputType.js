
const graphql = require('graphql')
const {
  GraphQLInputObjectType,
  GraphQLInt,
  GraphQLString,
  GraphQLNonNull,
  GraphQLBoolean,
  GraphQLID,
  GraphQLList,
  GraphQLFloat
} = graphql


const GapAnalysisInputType = new GraphQLInputObjectType({
  name: 'GapAnalysisInputType',
  fields: () => ({
    coreSubject: {type: new GraphQLNonNull(GraphQLString)},
    issueOfInterest: {type: new GraphQLNonNull(GraphQLString)},
    keyConsideration: {type: new GraphQLNonNull(GraphQLString)},
    performanceValue: {type: GraphQLInt},
    relevanceValue: {type: GraphQLInt},
    customField: { type: new GraphQLList(GraphQLFloat)},
    extraCustomField: { type: new GraphQLList(GraphQLFloat)},
    note: {type: GraphQLString},
    file: {type: GraphQLID},
    noDocument: {type: GraphQLBoolean},
    noRelatedDocument: {type: GraphQLBoolean},
  }),
})

module.exports = GapAnalysisInputType
