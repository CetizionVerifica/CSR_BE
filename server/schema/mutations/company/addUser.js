const {find} = require('lodash')
const mongoose = require('mongoose')
const {
  GraphQLNonNull,
  GraphQLID,
} = require('graphql')
const getProjection = require('../../../helpers/getProjection')

const UserModel = require('../../../models/user')
const CompanyType = require('../../types/companyType')
const UserCompanyInputType = require('../../types/userCompanyInputType')
const CompanyModel = require('../../../models/company')
const updateItem = require('../_helper/updateItem')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: CompanyType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    data: {
      name: 'data',
      type: new GraphQLNonNull(UserCompanyInputType),
    },

  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const company = await CompanyModel.findById(params.id)
    if (!company) {
      throw new Error('Error company not found')
    }
    const userCompany = Object.assign({}, params.data)

    const myObjectId = mongoose.Types.ObjectId(userCompany.user)
    const hasUser = find(company.users, {user: myObjectId})

    if (hasUser) {
      hasUser.projects = userCompany.projects
      hasUser.permission = userCompany.permission
      hasUser.updatedBy = root.user._id
      const {item} = await updateItem({
        id: params.id,
        type: 'company',
        changes: {users: [...company.users]},
        projection,
        userId: root.user._id,
      })
      return item

    } else {
      const user = await UserModel.findById(userCompany.user)
      if (!user) {
        throw new Error('Error user not found')
      }
      const companyUser = {
        user: userCompany.user,
        projects: userCompany.projects,
        permission: userCompany.permission,
        createdBy: root.user._id,
        updatedBy: root.user._id,
      }
      await updateItem({
        id: userCompany.user,
        type: 'user',
        changes: {companies: [...user.companies, company]},
        projection,
        userId: root.user._id,
      })
      const {item} = await updateItem({
        id: params.id,
        type: 'company',
        changes: {users: [...company.users, companyUser]},
        projection,
        userId: root.user._id,
      })
      return item
    }

  },
}
