const {GraphQLList, GraphQLInt} = require('graphql')
const ProjectType = require('../../types/projectType')
const ProjectModel = require('../../../models/project')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: new GraphQLList(ProjectType),
  args: {
    year: {
      name: 'year',
      type: GraphQLInt,
    },
  },
  resolve(parentValue, params, context, options) {
    checkAuth(context.isAuthenticated())

    const query = ProjectModel.find({agency: parentValue.user.currentAgency, year: params.year})
    return query.exec()
  },
}
