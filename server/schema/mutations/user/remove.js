const {
  GraphQLNonNull,
  GraphQLID,
} = require('graphql')

const userType = require('../../types/userType')
const UserModel = require('../../../models/user')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: userType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
  },
  async resolve(root, params, context) {
    checkAuth(context.isAuthenticated())


    // if (config.demo) {
    //   throw new Error('Remove user is disabled on the demo')
    // }

    const removedUser = await UserModel.findByIdAndRemove(params.id).exec()

    if (!removedUser) {
      throw new Error('Error removing user')
    }

    // clean user's tabs and drafts
    //await TabModel.find({_userId: removedUser._id}).remove()
    //await DraftModel.find({userId: removedUser._id}).remove()

    return removedUser
  },
}
