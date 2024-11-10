const {
  GraphQLNonNull,
  GraphQLID,
} = require('graphql')

const ActionsAndKPIsType = require('../../types/actionsAndKPIsType')
const ActionsAndKPIsModel = require('../../../models/actionsAndKPIs')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: ActionsAndKPIsType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
  },
  async resolve(root, params, context) {
    checkAuth(context.isAuthenticated())

    const removedActionsAndKPI = await ActionsAndKPIsModel
      .findByIdAndRemove(params.id).exec()

    if (!removedActionsAndKPI) {
      throw new Error('Error removing removedActionsAndKPI')
    }
    removedActionsAndKPI.remove()
    return removedActionsAndKPI
  },
}
