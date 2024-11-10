const graphql = require('graphql')
const {
  GraphQLObjectType,
  GraphQLID,
  GraphQLString,
  GraphQLFloat,
  GraphQLList,
} = graphql
const ProjectSurveyModel = require('../../models/projectSurvey')
const AgencyModel = require('../../models/agency')

const ProjectSurveyType = new GraphQLObjectType({
  name: 'ProjectSurveyType',
  fields: () => ({
    id: {type: GraphQLID},
    agency: {
      type: require('./agencyType'),
      resolve(parentValue) {
        return ProjectSurveyModel.findById(parentValue).populate('agency')
          .then(ProjectSurveyModel => {
            return ProjectSurveyModel.agency
          })
      },
      /*async resolve(projectSurvey) {
        return await AgencyModel.findById(projectSurvey.agency).exec()
      },*/
    },
    project: {
      type: require('./projectType'),
      resolve(parentValue) {
        return ProjectSurveyModel.findById(parentValue).populate('project')
          .then(ProjectSurveyModel => {
            return ProjectSurveyModel.project
          })
      },
    },
    status: {type: GraphQLString},
    sendDate: {
      type: GraphQLFloat,
      resolve({sendDate}) {
        return sendDate && sendDate.getTime()
      },
    },
    reminderSendDate: {
      type: GraphQLFloat,
      resolve({reminderSendDate}) {
        return reminderSendDate && reminderSendDate.getTime()
      },
    },
    closeDate: {
      type: GraphQLFloat,
      resolve({closeDate}) {
        return closeDate && closeDate.getTime()
      },
    },
    internal: {
      type: require('./sendSurveyType'),
      resolve({internal}) {
        return internal
      },
    },
    external: {
      type: require('./sendSurveyType'),
      resolve({external}) {
        return external
      },
    },
  }),
})

module.exports = ProjectSurveyType
