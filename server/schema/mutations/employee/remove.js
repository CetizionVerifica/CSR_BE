const {
  GraphQLNonNull,
  GraphQLID,
} = require('graphql')

const EmployeeType = require('../../types/employeeType')
const EmployeeModel = require('../../../models/employee')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: EmployeeType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
  },
  async resolve(root, params, context) {
    checkAuth(context.isAuthenticated())

    const removedEmployee = await EmployeeModel
      .findByIdAndRemove(params.id).exec()

    if (!removedEmployee) {
      throw new Error('Error removing employee')
    }
    removedEmployee.remove()
    return removedEmployee
  },
}
