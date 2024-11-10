const {
  GraphQLNonNull,
  GraphQLID,
} = require('graphql')

const StakeholderType = require('../../types/stakeholderType')
const StakeholderModel = require('../../../models/stakeholder')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: StakeholderType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
  },
  async resolve(root, params, context) {
    checkAuth(context.isAuthenticated())

    const removedStakeholder = await StakeholderModel
      .findByIdAndRemove(params.id).exec()

    if (!removedStakeholder) {
      throw new Error('Error removing stakeholder')
    }
    removedStakeholder.remove()
    return removedStakeholder
  },
}
