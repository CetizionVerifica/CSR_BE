const {GraphQLID} = require('graphql')
const getProjection = require('../../../helpers/getProjection')
const ProjectSurveyType = require('../../types/projectSurveyType')
const ProjectSurveyModel = require('../../../models/projectSurvey')
const {checkAuth} = require('../../../services/checkAuth')

const projectSurvey = {
  type: ProjectSurveyType,
  args: {
    id: {
      name: 'id',
      type: GraphQLID,
    },
  },
  resolve(parentValue, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])

    return ProjectSurveyModel
      .findById(params.id)
      .select(projection)
      .exec()
  },
}

module.exports = {
  projectSurvey,
}
