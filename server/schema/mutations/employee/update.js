const getProjection = require('../../../helpers/getProjection')
const {
  GraphQLNonNull,
  GraphQLID,
  GraphQLBoolean,
} = require('graphql')
const EmployeeInputType = require('../../types/employeeInputType')
const EmployeeType = require('../../types/employeeType')
const updateItem = require('../_helper/updateItem')
const {checkAuth} = require('../../../services/checkAuth')


const updateEmployee = {
  type: EmployeeType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    data: {
      name: 'data',
      type: new GraphQLNonNull(EmployeeInputType),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])

    const {item} = await updateItem({
      id: params.id,
      type: 'employee',
      changes: {...params.data},
      projection,
      userId: root.user._id,
    })
    return item
  },
}

const activeEmployee = {
  type: EmployeeType,
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
      type: 'employee',
      changes: {active: params.active},
      projection,
      userId: root.user._id,
    })
    return item
  },
}

module.exports = {
  updateEmployee,
  activeEmployee,
}
