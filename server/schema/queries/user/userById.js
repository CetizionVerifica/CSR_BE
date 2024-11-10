const UserType = require('../../types/userType')
const UserModel = require('../../../models/user')
const { GraphQLID} = require('graphql')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: UserType,
  args: {
    id: {
      name: 'id',
      type: GraphQLID,
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())
    const user = await UserModel.findById(params.id)

    return user
  },
}
