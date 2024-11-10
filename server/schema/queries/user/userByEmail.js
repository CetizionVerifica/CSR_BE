const UserType = require('../../types/userType')
const UserModel = require('../../../models/user')
const {GraphQLString} = require('graphql')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: UserType,
  args: {
    email: {
      name: 'email',
      type: GraphQLString,
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())
    const user = await UserModel.findOne({email: params.email})

    return user
  },
}
