const {GraphQLID} = require('graphql')
const getProjection = require('../../../helpers/getProjection')
const MaterialityType = require('../../types/materialityType')
const MaterialityModel = require('../../../models/materiality')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: MaterialityType,
  args: {
    id: {
      name: 'id',
      type: GraphQLID,
    },
  },
  resolve(parentValue, params, context, options) {
    const projection = getProjection(options.fieldNodes[0])
    checkAuth(context.isAuthenticated())

    let id = params.id
    if (!id) {
      id = parentValue.user._id
    }
    return MaterialityModel
      .findById(id)
      .select(projection)
      .exec()
  },
}
