const UserType = require('../../types/userType')
const UserModel = require('../../../models/user')
const {GraphQLString, GraphQLList} = require('graphql')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: new GraphQLList(UserType),
  args: {
    role: {
      name: 'role',
      type: GraphQLString,
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())
    const user = await UserModel.find({role: {$regex: params.role, $options: 'i'}})

    return user
  },
}
