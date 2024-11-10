const getProjection = require('../../../helpers/getProjection')
const {
  GraphQLNonNull,
  GraphQLID,
  GraphQLBoolean,
} = require('graphql')
const StakeholderInputType = require('../../types/stakeholderInputType')
const StakeholderType = require('../../types/stakeholderType')
const updateItem = require('../_helper/updateItem')
const {checkAuth} = require('../../../services/checkAuth')


const updateStakeholder = {
  type: StakeholderType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    data: {
      name: 'data',
      type: new GraphQLNonNull(StakeholderInputType),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])

    const {item} = await updateItem({
      id: params.id,
      type: 'stakeholder',
      changes: {...params.data},
      projection,
      userId: root.user._id,
    })
    return item
  },
}

const activeStakeholder = {
  type: StakeholderType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    active: {
      name: 'active',
      type: new GraphQLNonNull(GraphQLBoolean),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const {item} = await updateItem({
      id: params.id,
      type: 'stakeholder',
      changes: {active: params.active},
      projection,
      userId: root.user._id,
    })
    return item
  },
}

module.exports = {
  updateStakeholder,
  activeStakeholder,
}
