
const graphql = require('graphql')
const {
  GraphQLInputObjectType,
  GraphQLFloat,
  GraphQLString,
  GraphQLNonNull,
  GraphQLID,
} = graphql


const ActionsAndKPIsInputType = new GraphQLInputObjectType({
  name: 'ActionsAndKPIsInputType',
  fields: () => ({
    coreSubject: {type: new GraphQLNonNull(GraphQLString)},
    issueOfInterest: {type: new GraphQLNonNull(GraphQLString)},
    action: {type: GraphQLString},
    kpi: {type: GraphQLString},
    baselinePerformance: {type: GraphQLFloat},
    targetPerformance: {type: GraphQLFloat},
    year: {type: GraphQLFloat},
    projectId: {type: GraphQLID},
  }),
})

module.exports = ActionsAndKPIsInputType
