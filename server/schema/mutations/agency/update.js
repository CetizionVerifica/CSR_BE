const getProjection = require('../../../helpers/getProjection')
const {
  GraphQLNonNull,
  GraphQLID,
} = require('graphql')
const AgencyInputType = require('../../types/agencyInputType')
const UpdateAgencyByIdInputType  = require('../../types/updateAgencyByIdInputType')
const AgencyType = require('../../types/agencyType')
const updateItem = require('../_helper/updateItem')
const UserModel = require('../../../models/user')
const AgencyModel = require('../../../models/agency')
const {checkAuth} = require('../../../services/checkAuth')

const updateAgency = {
  type: AgencyType,
  args: {
    data: {
      name: 'data',
      type: new GraphQLNonNull(AgencyInputType),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    // console.log(root.user.currentAgency)
    const {item} = await updateItem({
      id: root.user.currentAgency,
      type: 'agency',
      changes: {...params.data},
      projection,
      userId: root.user._id,
    })
    return item
  },
}
const updateAgencyById = {
  type: AgencyType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID)
    },
    data: {
      name: 'data',
      type: new GraphQLNonNull(UpdateAgencyByIdInputType),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())
    const { users, companies, projects } = params.data
    const updatedAgency = await AgencyModel.findByIdAndUpdate(params.id, {
      users,
      companies,
      projects
    }, { new: true }).populate("companies")
    return updatedAgency
  },
}

const removeUserFromAgency = {
  type: AgencyType,
  args: {
    userId: {
      name: 'userId',
      type: new GraphQLNonNull(GraphQLID),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const user = await UserModel.findByIdAndUpdate({_id: params.userId}, {
      $pull: {agencies: root.user.currentAgency},
    })
    if (!user) {
      throw new Error('User does not exist')
    }
    const {item} = await updateItem({
      id: root.user.currentAgency,
      type: 'agency',
      changes: {$pull: {users: params.userId}},
      projection,
      userId: root.user._id,
    })
    return item
  },
}


module.exports = {
  updateAgency,
  removeUserFromAgency,
  updateAgencyById
}
