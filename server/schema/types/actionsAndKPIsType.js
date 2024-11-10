
const graphql = require('graphql')
const {
  GraphQLObjectType,
  GraphQLFloat,
  GraphQLID,
  GraphQLString,
  GraphQLList,
} = graphql

const ProjectActionsAndKPIsType = require('./projectActionsAndKPIsType')
const UserType = require('./userType')
const UserModel = require('../../models/user')
const ActionsAndKPIsModel = require('../../models/actionsAndKPIs')


const ActionsAndKPIsType = new GraphQLObjectType({
  name: 'ActionsAndKPIsType',
  fields: () => ({
    id: {type: GraphQLID},
    company: {
      type: require('./companyType'),
      resolve(parentValue) {
        return ActionsAndKPIsModel.findById(parentValue).populate('company')
          .then(actionsAndKPIs => {
            return actionsAndKPIs.company
          })
      },
    },
    projectPerformance: {
      type: GraphQLList(ProjectActionsAndKPIsType),
    },
    coreSubject: {
      type: GraphQLString,
    },
    issueOfInterest: {
      type: GraphQLString,
    },
    action: {
      type: GraphQLString,
    },
    kpi: {
      type: GraphQLString,
    },
    year: {
      type: GraphQLFloat,
    },
    baselinePerformance: {
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

module.exports = ActionsAndKPIsType
