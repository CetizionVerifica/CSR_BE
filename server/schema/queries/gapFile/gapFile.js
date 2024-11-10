const {GraphQLID, GraphQLNonNull} = require('graphql')
const GapFileType = require('../../types/gapFileType')
const GapFileModel = require('../../../models/gapFile')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: GapFileType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
  },
  resolve(parentValue, params, context, options) {
    checkAuth(context.isAuthenticated())

    return GapFileModel.findById(params.id)
  },
}
