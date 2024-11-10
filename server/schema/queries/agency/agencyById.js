const getProjection = require('../../../helpers/getProjection')
const AgencyType = require('../../types/agencyType')
const {GraphQLID} = require('graphql')
const AgencyModel = require('../../../models/agency')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: AgencyType,
  args: {
    id: {
        name: 'id',
        type: GraphQLID,
    },
  },
  resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])

    let id = params.id
    if (!id) {
      throw new Error('Error  agency')
    }

    return AgencyModel
      .findById(id)
      .select(projection)
      .exec()
  },
}
