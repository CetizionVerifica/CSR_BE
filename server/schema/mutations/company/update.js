const getProjection = require('../../../helpers/getProjection')
const {
  GraphQLNonNull,
  GraphQLID,
} = require('graphql')
const CompanyInputType = require('../../types/companyInputType')
const CompanyType = require('../../types/companyType')
const UserModel = require('../../../models/user')
const updateItem = require('../_helper/updateItem')
const {checkAuth} = require('../../../services/checkAuth')


const updateCompany = {
  type: CompanyType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    data: {
      name: 'data',
      type: new GraphQLNonNull(CompanyInputType),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())
    // console.log(params.data)
    const projection = getProjection(options.fieldNodes[0])
    const {item} = await updateItem({
      id: params.id,
      type: 'company',
      changes: {...params.data},
      projection,
      userId: root.user._id,
    })
    const user = await UserModel.findOne({ email: params.data.personEmail });
    if (user) {
      user.password = params.data.password
      await user.save()
    }
    return item
  },
}

module.exports = {
  updateCompany,
}
