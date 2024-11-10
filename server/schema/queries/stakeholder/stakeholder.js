const {GraphQLID} = require('graphql')
const getProjection = require('../../../helpers/getProjection')
const StakeholderType = require('../../types/stakeholderType')
const StakeholderModel = require('../../../models/stakeholder')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: StakeholderType,
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

    return StakeholderModel
      .findById(id)
      .select(projection)
      .exec()
  },
}
