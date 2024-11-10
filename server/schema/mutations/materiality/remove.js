const {
  GraphQLNonNull,
  GraphQLID,
} = require('graphql')

const MaterialityType = require('../../types/materialityType')
//const ProjectModel = require('../../../models/project')
const MaterialityModel = require('../../../models/materiality')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: MaterialityType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
  },
  async resolve(root, params, context) {
    checkAuth(context.isAuthenticated())

    const removedMateriality = await MaterialityModel
      .findByIdAndRemove(params.id)

    if (!removedMateriality) {
      throw new Error('Error removing Materiality')
    }
    removedMateriality.remove()
    return removedMateriality
  },
}

