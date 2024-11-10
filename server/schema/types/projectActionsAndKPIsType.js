const graphql = require('graphql')
const {
  GraphQLObjectType,
  GraphQLID,
  GraphQLString,
  GraphQLNonNull,
  GraphQLFloat,
  GraphQLBoolean,
} = graphql


const ProjectActionsAndKPIsType = new GraphQLObjectType({
  name: 'ProjectActionsAndKPIsType',
  fields: () => ({
    project: {type: new GraphQLNonNull(GraphQLID)},
    performance: {type: GraphQLFloat},
    targetPerformance: {type: GraphQLFloat},
    year: {type: GraphQLFloat},
    isBaseline: {type: GraphQLBoolean},
    note: {type: GraphQLString},
  }),
})

module.exports = ProjectActionsAndKPIsType
