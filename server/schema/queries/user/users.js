const {GraphQLList} = require('graphql')
const getProjection = require('../../../helpers/getProjection')
const UserType = require('../../types/userType')
const UserModel = require('../../../models/user')
const {paginationQueryArgs,
  paginateQuery,
  searchQuery} = require('../../queryPagination')
const {checkAuth, checkAuthAdmin} = require('../../../services/checkAuth')

module.exports = {
  type: new GraphQLList(UserType),
  args: {
    ...paginationQueryArgs,
  },
  resolve(parentValue, params, context, options) {
    checkAuth(context.isAuthenticated())
    // checkAuthAdmin(context.user.role.split('|'))
    const projection = getProjection(options.fieldNodes[0])
    const query = UserModel.find(searchQuery({}, params))
    paginateQuery(query, params)
    return query.select(projection).exec()
  },
}
