const {GraphQLList} = require('graphql')
const getProjection = require('../../../helpers/getProjection')
const ProjectSurveyType = require('../../types/projectSurveyType')
const ProjectSurveyModel = require('../../../models/projectSurvey')
const {paginationQueryArgs,
  paginateQuery} = require('../../queryPagination')
const {checkAuth} = require('../../../services/checkAuth')

const projectSurveys = {
  type: new GraphQLList(ProjectSurveyType),
  args: {
    ...paginationQueryArgs,
  },
  resolve(parentValue, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const query = ProjectSurveyModel.find({agency: parentValue.user.currentAgency}, params)
    paginateQuery(query, params)
    return query.select(projection).exec()
  },
}

module.exports = {
  projectSurveys,
}
