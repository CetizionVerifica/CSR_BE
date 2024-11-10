const {GraphQLList, GraphQLID, GraphQLNonNull} = require('graphql')
const getProjection = require('../../../helpers/getProjection')
const StakeholderType = require('../../types/stakeholderType')
const StakeholderModel = require('../../../models/stakeholder')
const {paginationQueryArgs,
  paginateQuery,
  searchQuery} = require('../../queryPagination')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: new GraphQLList(StakeholderType),
  args: {
    companyId: {
      name: 'company',
      type: new GraphQLNonNull(GraphQLID),
    },
    ...paginationQueryArgs,
  },
  resolve(parentValue, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const query = StakeholderModel.find({company: params.companyId}).find(searchQuery({}, params))
    paginateQuery(query, params)
    return query.select(projection).exec()
  },
}
