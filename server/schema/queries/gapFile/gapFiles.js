const {GraphQLList, GraphQLID, GraphQLNonNull} = require('graphql')
const getProjection = require('../../../helpers/getProjection')
const GapFileType = require('../../types/gapFileType')
const GapFileModel = require('../../../models/gapFile')
const {
  searchQuery} = require('../../queryPagination')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: new GraphQLList(GapFileType),
  args: {
    projectId: {
      name: 'project',
      type: new GraphQLNonNull(GraphQLID),
    },
  },
  resolve(parentValue, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const query = GapFileModel.find({project: params.projectId}).find(searchQuery({}, params))
    return query.select(projection).exec()
  },
}
