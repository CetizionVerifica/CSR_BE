const {GraphQLList} = require('graphql')
const getProjection = require('../../../helpers/getProjection')
const AgencyType = require('../../types/agencyType')
const AgencyModel = require('../../../models/agency')
const {paginationQueryArgs,
  paginateQuery,
  searchQuery} = require('../../queryPagination')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: new GraphQLList(AgencyType),
  args: {
    ...paginationQueryArgs,
  },
  resolve(parentValue, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const query = AgencyModel.find(searchQuery({}, params))
    paginateQuery(query, params)
    return query.select(projection).exec()
  },
}
