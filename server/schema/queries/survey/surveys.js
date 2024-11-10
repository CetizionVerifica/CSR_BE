const {GraphQLList} = require('graphql')
const getProjection = require('../../../helpers/getProjection')
const SurveyType = require('../../types/surveyType')
const SurveyModel = require('../../../models/survey')
const {paginationQueryArgs,
  paginateQuery} = require('../../queryPagination')
const {checkAuth} = require('../../../services/checkAuth')

const surveys = {
  type: new GraphQLList(SurveyType),
  args: {
    ...paginationQueryArgs,
  },
  resolve(parentValue, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const query = SurveyModel.find()
    paginateQuery(query, params)
    return query.select(projection).exec()
  },
}

const selectedSurveys = {
  type: new GraphQLList(SurveyType),
  args: {},
  resolve(parentValue, params, context, options) {
    checkAuth(context.isAuthenticated())

    return SurveyModel.find({flag: {$in: ['internal', 'external']}}).exec()
  },
}

module.exports = {
  surveys,
  selectedSurveys,
}
