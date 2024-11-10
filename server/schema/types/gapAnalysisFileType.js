
const graphql = require('graphql')
const {
  GraphQLInputObjectType,
  GraphQLID,
  GraphQLString,
  GraphQLNonNull,
} = graphql


const GapAnalysisFileType = new GraphQLInputObjectType({
  name: 'GapAnalysisFileType',
  fields: () => ({
    coreSubject: {type: new GraphQLNonNull(GraphQLString)},
    issueOfInterest: {type: new GraphQLNonNull(GraphQLString)},
    keyConsideration: {type: new GraphQLNonNull(GraphQLString)},
    file: {type: GraphQLID},
  }),
})

module.exports = GapAnalysisFileType
