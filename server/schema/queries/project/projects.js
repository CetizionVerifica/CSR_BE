const {GraphQLList, GraphQLID, GraphQLString} = require('graphql')
const getProjection = require('../../../helpers/getProjection')
const ProjectType = require('../../types/projectType')
const ProjectModel = require('../../../models/project')
const {paginationQueryArgs,
  paginateQuery,
  searchQuery} = require('../../queryPagination')
const {checkAuth, checkAuthAdmin} = require('../../../services/checkAuth')

const projects = {
  type: new GraphQLList(ProjectType),
  args: {
    companyId: {
      name: 'company',
      type: GraphQLID,
    },
    ...paginationQueryArgs,
  },
  resolve(parentValue, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    if (params.companyId) {
      const query = ProjectModel.find(
        {
         // agency: parentValue.user.currentAgency,
          company: params.companyId,
        }).find(searchQuery({}, params))
      paginateQuery(query, params)
      return query.select(projection).exec()
    } else {
      const query = ProjectModel.find(searchQuery({agency: parentValue.user.currentAgency}, params))
      paginateQuery(query, params)
      return query.select(projection).exec()
    }

  },
}

const projectsByStatus = {
  type: new GraphQLList(ProjectType),
  args: {
    status: {
      name: 'status',
      type: GraphQLString,
    },
    ...paginationQueryArgs,
  },
  resolve(parentValue, params, context, options) {

    // if (parentValue.user.role !== 'Admin') {
    //   return []
    // }
    checkAuth(context.isAuthenticated())
    checkAuthAdmin(context.user.role.split('|'))

    const projection = getProjection(options.fieldNodes[0])
    const query = ProjectModel.find(searchQuery({status: params.status}, params))
    paginateQuery(query, params)
    return query.select(projection).exec()
  },
}
const allProjects = {
  type: new GraphQLList(ProjectType),
  args: {
  },
  async resolve(parentValue, params, context, options) {

    // if (parentValue.user.role !== 'Admin') {
    //   return []
    // }
    checkAuth(context.isAuthenticated())
    checkAuthAdmin(context.user.role.split('|'))

    const projects = await ProjectModel.find({})
    return projects
  },
}

module.exports = {
  projects,
  projectsByStatus,
  allProjects
}
