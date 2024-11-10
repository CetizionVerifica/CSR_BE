const getProjection = require('../../../helpers/getProjection')
const {
  GraphQLNonNull,
  GraphQLID,
} = require('graphql')
const CompanyInputType = require('../../types/companyInputSurveyEmail')
const CompanyType = require('../../types/companyType')
const updateItem = require('../_helper/updateItem')
const {checkAuth} = require('../../../services/checkAuth')


const updateSurveyEmailTemplates = {
  type: CompanyType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    data: {
      name: 'data',
      type: new GraphQLNonNull(CompanyInputType),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    // console.log(params.data)
    const projection = getProjection(options.fieldNodes[0])
    const {item} = await updateItem({
      id: params.id,
      type: 'company',
      changes: {...params.data},
      projection,
      userId: root.user._id,
    })
    return item
  },
}

module.exports = {
  updateSurveyEmailTemplates,
}
