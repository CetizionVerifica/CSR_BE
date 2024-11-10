const graphql = require('graphql')
const {
  GraphQLInputObjectType,
  GraphQLID,
  GraphQLString,
  GraphQLNonNull,
  GraphQLFloat,
} = graphql


const ProjectActionsAndKPIsInputType = new GraphQLInputObjectType({
  name: 'ProjectActionsAndKPIsInputType',
  fields: () => ({
    project: {type: new GraphQLNonNull(GraphQLID)},
    performance: {type: new GraphQLNonNull(GraphQLFloat)},
    targetPerformance: {type: new GraphQLNonNull(GraphQLFloat)},
    year: {type: new GraphQLNonNull(GraphQLFloat)},
    note: {type: GraphQLString},
  }),
})

module.exports = ProjectActionsAndKPIsInputType
