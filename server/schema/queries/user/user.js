const getProjection = require('../../../helpers/getProjection')
const UserType = require('../../types/userType')
const UserModel = require('../../../models/user')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: UserType,
  args: {
  },
  resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())
    const projection = getProjection(options.fieldNodes[0])

    let id = root.user._id
    if (!id) {
      id = root.user._id
    }

    return UserModel
      .findById(id)
      .select(projection)
      .exec()
  },
}
