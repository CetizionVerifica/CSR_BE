const graphql = require('graphql')
const {
  GraphQLObjectType,
  GraphQLInt,
  GraphQLString,
  GraphQLNonNull,
  GraphQLBoolean,
  GraphQLFloat,
} = graphql
const GapFileType = require('./gapFileType')
const GapFileModel = require('../../models/gapFile')

const GapkeyConsiderationType = new GraphQLObjectType({
  name: 'GapkeyConsiderationType',
  fields: () => ({
    keyConsideration: {type: new GraphQLNonNull(GraphQLString)},
    performanceValue: {type: GraphQLInt},
    actualPerformanceValue: {type: GraphQLInt},
    relevanceValue: {type: GraphQLInt},
    relevanceWeightValue: {type: GraphQLFloat},
    revisedWeightValue: {type: GraphQLFloat},
    revisedPerformanceValue : {type: GraphQLFloat},

    WeightValue: {type: GraphQLFloat},
    issueLevel: {type: GraphQLInt},
    revisingScore: {type: GraphQLFloat},
    revisedScore: {type: GraphQLFloat},
    note: {type: GraphQLString},
    file: {type: GapFileType,
      async resolve(keyConsideration) {
        return await GapFileModel.findById(keyConsideration.file).exec()
      },

    },
    noDocument: {type: GraphQLBoolean},
    noRelatedDocument: {type: GraphQLBoolean},
  }),
})

module.exports = GapkeyConsiderationType
