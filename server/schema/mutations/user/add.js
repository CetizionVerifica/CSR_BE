const {
  GraphQLNonNull,
  GraphQLString,
} = require('graphql')
const getProjection = require('../../../helpers/getProjection')
const userInputType = require('../../types/userInputType')
const userType = require('../../types/userType')
const UserModel = require('../../../models/user')
const AgencyModel = require('../../../models/agency')
const updateItem = require('../_helper/updateItem')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: userType,
  args: {
    password: {
      name: 'password',
      type: new GraphQLNonNull(GraphQLString),
    },
    data: {
      name: 'data',
      type: new GraphQLNonNull(userInputType),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const agency = await AgencyModel.findById(root.user.currentAgency)

    if (!agency) {
      throw new Error('Error cant find agency')
    }


    const userData = Object.assign({}, params.data)
    userData.createdBy = root.user._id
    userData.updatedBy = root.user._id
    userData.password = params.password
    userData.currentAgency = root.user.currentAgency
    userData.agencies = [root.user.currentAgency]

    const existUser = await await UserModel.findOneAndUpdate({email: userData.email}, {
      $push: {agencies: agency},
    })
    if (existUser) {
      await updateItem({
        id: agency.id,
        type: 'agency',
        changes: {users: [...agency.users, existUser]},
        projection,
        userId: root.user._id,
      })
      return existUser
    } else {
      const userModel = new UserModel(userData)
      const user = await userModel.save()

      if (!user) {
        throw new Error('Error creating user')
      }

      await updateItem({
        id: agency.id,
        type: 'agency',
        changes: {users: [...agency.users, user]},
        projection,
        userId: root.user._id,
      })
      return user
    }
  },
}
