const {
  GraphQLNonNull,
} = require('graphql')
const AgencyInputType = require('../../types/agencyInputType')
const AgencyType = require('../../types/agencyType')
const UserModel = require('../../../models/user')
const AgencyModel = require('../../../models/agency')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: AgencyType,
  args: {
    data: {
      name: 'data',
      type: new GraphQLNonNull(AgencyInputType),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const agencyData = Object.assign({}, params.data)
    agencyData.createdBy = root.user._id
    agencyData.updatedBy = root.user._id
    agencyData.users = [root.user._id]
    const agencyModel = new AgencyModel(agencyData)
    const agency = await agencyModel.save()

    if (!agency) {
      throw new Error('Error creating agency')
    }
    const user = await UserModel.findByIdAndUpdate({_id: root.user._id}, {
      $push: {agencies: agency},
      currentAgency: agency,
    })
    if (!user) {
      throw new Error('User does not exist')
    }
    return agency
  },
}
