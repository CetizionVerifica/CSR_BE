const {
  GraphQLNonNull,
  GraphQLID,
} = require('graphql')

const ProjectType = require('../../types/projectType')
const ProjectModel = require('../../../models/project')
const MaterialityModel = require('../../../models/materiality')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: ProjectType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
  },
  async resolve(root, params, context) {
    checkAuth(context.isAuthenticated())

    const removedProject = await ProjectModel
      .findByIdAndRemove(params.id).exec()

    if (!removedProject) {
      throw new Error('Error removing Project')
    }
    await MaterialityModel.find({project: removedProject._id}).remove()
    return removedProject
  },
}
