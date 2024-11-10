const getProjection = require('../../../helpers/getProjection')
const {
  GraphQLNonNull,
  GraphQLID,
  GraphQLString,
  GraphQLBoolean,
} = require('graphql')
const UserInputType = require('../../types/userInputType')
const UserUpdateInputType = require('../../types/userUpdateInputType')
const userType = require('../../types/userType')
const UserModel = require('../../../models/user')
//const updateItem = require('../_helper/updateItem')
const AgencyModel = require('../../../models/agency')
const SupplierRequestModel = require('../../../models/supplierRequest')
const {checkAuth} = require('../../../services/checkAuth')

async function updateUser({userId, projection, data}) {
  const user = await UserModel
    .findByIdAndUpdate(
      userId,
      data,
      {upsert: true, new: true}
    )
    .select(projection)

  if (!user) {
    throw new Error('Error updating user')
  }
  return user
}

const addUserToOrganisation = {
  type: userType,
  args: {
    email: {
      name: 'email',
      type: new GraphQLNonNull(GraphQLString),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const agencyId = root.user.currentAgency

    //const projection = getProjection(options.fieldNodes[0])
    const agency = await AgencyModel.findById(agencyId)
    if (!agency) {
      throw new Error('Error cant find agency')
    }

    const existUser = await UserModel.findOneAndUpdate({email: params.email}, {
      $addToSet: {agencies: agency, $unique: 'id'},
    })

    // console.log(existUser)
    if (existUser) {
      // await updateItem({
      //   id: agency.id,
      //   type: 'agency',
      //   changes: {users: [...agency.users, existUser]},
      //   projection,
      //   userId: root.user._id,
      // })
      const updateAgency = await AgencyModel.findByIdAndUpdate({_id: agencyId}, {
        $addToSet: {users: existUser, $unique: 'id'},
      })

      if (!updateAgency) {
        throw new Error('Error update agency')
      }

      if (!existUser.currentAgency) {
        await UserModel.findOneAndUpdate({_id: existUser._id}, {
          currentAgency: updateAgency,
        })
      }

      // Find pending supplier requests
      const supplierRequests = await SupplierRequestModel.find({email: params.email}).exec()

      if (supplierRequests) {
        // If there are any add the request to the agency
        supplierRequests.forEach(async request => {
          let agency = await AgencyModel.findOne({'_id': agencyId, 'partners.company': request.company}).exec()

          if (!agency) {
            agency = await AgencyModel.findOneAndUpdate({_id: agencyId},
              {$addToSet: {partners: {company: request.company}}}).exec()
          }

          if (!agency) {
            throw new Error('Error agency')
          }

          if (request.type === 'Supplier') {
            agency = await AgencyModel.findOneAndUpdate({'_id': agencyId, 'partners.company': request.company},
              {$addToSet: {'partners.$.requestedYears': request.requestedYear}}).exec()
          } else {
            agency = await AgencyModel.findOneAndUpdate({'_id': agencyId, 'partners.company': request.company},
              {$addToSet: {'partners.$.partnerRequestedProjects': request.project}}).exec()
          }

          if (!agency) {
            throw new Error('Error company')
          }

          request.remove()
        })
      }

      return existUser
    } else {
      throw new Error('Error User Don\'t exist')
    }
  },
}

const updateUserData = {
  type: userType,
  args: {
    data: {
      name: 'data',
      type: new GraphQLNonNull(UserInputType),
    },
  },
  resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    return updateUser({
      userId: root.user._id,
      projection,
      data: {
        ...params.data,
      },
    })
  },
}
const updateUserDataById = {
  type: userType,
  args: {
    id: {
      name: 'id',
      type: GraphQLID
    },
    data: {
      name: 'data',
      type: new GraphQLNonNull(UserUpdateInputType),
    },
  },
  resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    return updateUser({
      userId: params.id,
      projection,
      data: {
        ...params.data,
      },
    })
  },
}

const activeUser = {
  type: userType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    active: {
      name: 'active',
      type: new GraphQLNonNull(GraphQLString),
    },
  },
  async resolve(root, params, options) {

    const projection = getProjection(options.fieldASTs[0])
    return updateUser({
      userId: params.id,
      projection,
      data: {
        active: params.active,
      },
    })
  },
}

const updateUserEmail = {
  type: userType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    value: {
      name: 'value',
      type: new GraphQLNonNull(GraphQLString),
    },
  },
  async resolve(root, params, options) {


    const projection = getProjection(options.fieldASTs[0])

    return updateUser({
      userId: params.id,
      projection,
      data: {
        email: params.value,
      },
    })
  },
}

const updateUserPassword = {
  type: userType,
  args: {
    oldPassword: {
      name: 'oldPassword',
      type: new GraphQLNonNull(GraphQLString),
    },
    newPassword: {
      name: 'newPassword',
      type: new GraphQLNonNull(GraphQLString),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const user = await UserModel.findById(root.user._id)
    if (!user) {
      throw new Error('User does not exist')
    }
    const isMatch = await user.compareChangePassword(params.oldPassword)
    if (!isMatch) {
      throw new Error('Error password does not match')
    }
    user.password = params.newPassword
    await user.save()
    return user
  },
}
const updateNewUserPassword = {
  type: userType,
  args: {
    newPassword: {
      name: 'newPassword',
      type: new GraphQLNonNull(GraphQLString),
    },
    userId: {
      name: 'userId',
      type: GraphQLString,
    },
  },
  async resolve(root, params, context, options) {
    const user = await UserModel.findById(params.userId)
    if (!user) {
      throw new Error('User does not exist')
    }
    user.password = params.newPassword
    user.active = true
    user.termsAndConditions = true
    await user.save()

    return user
  },
}


const updateLanguageUser = {
  type: userType,
  args: {
    language: {
      name: 'language',
      type: new GraphQLNonNull(GraphQLString),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])

    return updateUser({
      userId: root.user._id,
      projection,
      data: {
        lang: params.language,
      },
    })
  },
}

const acceptTermsAndConditionsUser = {
  type: userType,
  args: {
    terms: {
      name: 'terms',
      type: GraphQLBoolean,
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])

    return updateUser({
      userId: root.user._id,
      projection,
      data: {
        termsAndConditions: true,
      },
    })
  },
}
const updateCurrentAgencyUser = {
  type: userType,
  args: {
    agency: {
      name: 'agency',
      type: new GraphQLNonNull(GraphQLID),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])

    return updateUser({
      userId: root.user._id,
      projection,
      data: {
        currentAgency: params.agency,
      },
    })
  },
}

module.exports = {
  updateUserData,
  addUserToOrganisation,
  activeUser,
  updateUserEmail,
  updateUserPassword,
  updateLanguageUser,
  updateCurrentAgencyUser,
  acceptTermsAndConditionsUser,
  updateNewUserPassword,
  updateUserDataById
}
