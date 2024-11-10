const graphql = require('graphql')
//const ProjectType = require('./projectType')
const UserModel = require('../../models/user')
const {
  GraphQLObjectType,
  GraphQLID,
  GraphQLString,
  GraphQLNonNull,
  GraphQLList,
  GraphQLFloat,
} = graphql


const userCompanyType = new GraphQLObjectType({
  name: 'UserCompanyType',
  fields: () => ({
    id: {type: new GraphQLNonNull(GraphQLID)},
    user: {type: new GraphQLNonNull(GraphQLID)},
    permission: {type: new GraphQLNonNull(GraphQLString)},
    projects: {type: new GraphQLList(GraphQLID)},
    updatedBy: {
      type: require('./userType'),
      async resolve(company) {
        return await UserModel.findById(company.updatedBy).exec()
      },
    },
    createdBy: {
      type: require('./userType'),
      async resolve(company) {
        return await UserModel.findById(company.createdBy).exec()
      },
    },
    date: {
      type: GraphQLFloat,
      resolve({date}) {
        return date && date.getTime()
      },
    },
    updatedDate: {
      type: GraphQLFloat,
      resolve({updatedDate}) {
        return updatedDate && updatedDate.getTime()
      },
    },
  }),
})

module.exports = userCompanyType
