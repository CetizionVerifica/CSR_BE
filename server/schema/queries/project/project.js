const {GraphQLID} = require('graphql')
const getProjection = require('../../../helpers/getProjection')
const ProjectType = require('../../types/projectType')
const ProjectModel = require('../../../models/project')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: ProjectType,
  args: {
    id: {
      name: 'id',
      type: GraphQLID,
    },
  },
  resolve(parentValue, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    let id = params.id
    if (!id) {
      id = parentValue.user._id
    }
    return ProjectModel
      .findById(id)
      .select(projection)
      .exec()
  },
}
