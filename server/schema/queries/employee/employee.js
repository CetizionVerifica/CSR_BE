const {GraphQLID} = require('graphql')
const getProjection = require('../../../helpers/getProjection')
const EmployeeType = require('../../types/employeeType')
const EmployeeModel = require('../../../models/employee')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: EmployeeType,
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

    return EmployeeModel
      .findById(id)
      .select(projection)
      .exec()
  },
}
