const {GraphQLID} = require('graphql')
const getProjection = require('../../../helpers/getProjection')
const CompanyType = require('../../types/companyType')
const CompanyModel = require('../../../models/company')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: CompanyType,
  args: {
    id: {
      name: 'id',
      type: GraphQLID,
    },
  },
  resolve(parentValue, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])

    let id = params.id
    if (!id) {
      id = parentValue.user._id
    }

    return CompanyModel
      .findById(id)
      .select(projection)
      .exec()
  },
}
