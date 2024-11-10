
const graphql = require('graphql')
const {
  GraphQLObjectType,
  GraphQLFloat,
  GraphQLID,
  GraphQLList,
} = graphql

const GapCoreSubjectType = require('./gapCoreSubjectType')
const UserType = require('./userType')
const UserModel = require('../../models/user')
const GapAnalysisModel = require('../../models/gapAnalysis')


const GapAnalysisType = new GraphQLObjectType({
  name: 'GapAnalysisType',
  fields: () => ({
    id: {type: GraphQLID},
    coreSubjects: {type: GraphQLList(GapCoreSubjectType)},
    project: {
      type: require('./projectType'),
      resolve(parentValue) {
        return GapAnalysisModel.findById(parentValue).populate('project')
          .then(GapAnalysisModel => {
            return GapAnalysisModel.project
          })
      },
    },
    weightedPerformance: {
      type: GraphQLFloat,
    },
    revisedWeightValue: {
      type: GraphQLFloat,
    },
    relevance: {
      type: GraphQLFloat,
    },
    updatedBy: {
      type: UserType,
      async resolve(gapAnalysis) {
        return await UserModel.findById(gapAnalysis.updatedBy).exec()
      },
    },
    createdBy: {
      type: UserType,
      async resolve(gapAnalysis) {
        return await UserModel.findById(gapAnalysis.createdBy).exec()
      },
    },
    date: {
      type: GraphQLFloat,
      resolve({date}) {
        return date && date.getTime()
      },
    },
    updatedDate: {
      type: GraphQLFloat,
      resolve({updatedDate}) {
        return updatedDate && updatedDate.getTime()
      },
    },
  }),
})

module.exports = GapAnalysisType
