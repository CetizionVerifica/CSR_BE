const {
  GraphQLNonNull,
  GraphQLID,
  GraphQLString,
} = require('graphql')
const updateItem = require('../_helper/updateItem')
const getProjection = require('../../../helpers/getProjection')
const SurveyType = require('../../types/surveyType')
const SurveyModel = require('../../../models/survey')
const {checkAuth} = require('../../../services/checkAuth')

const flagSurvey = {
  type: SurveyType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    flag: {
      name: 'flag',
      type: new GraphQLNonNull(GraphQLString),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const flaggedSurvey = await SurveyModel.findOne({flag: params.flag})

    if (flaggedSurvey && flaggedSurvey.id !== params.id) {
      await updateItem({
        id: flaggedSurvey.id,
        type: 'survey',
        changes: {flag: null},
        projection,
      })
    }

    const {item} = await updateItem({
      id: params.id,
      type: 'survey',
      changes: {flag: params.flag},
      projection,
    })

    return item
  },
}

module.exports = {
  flagSurvey,
}
