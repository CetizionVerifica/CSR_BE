
const graphql = require('graphql')
const {
  GraphQLObjectType,
  GraphQLFloat,
  GraphQLID,
  GraphQLString,
  GraphQLBoolean,
  GraphQLList,
} = graphql

const UserType = require('./userType')
const GapFileCriterionType = require('./gapFileCriterionType')
const UserModel = require('../../models/user')
const ProjectModel = require('../../models/project')

const GapFileType = new GraphQLObjectType({
  name: 'GapFileType',
  fields: () => ({
    id: {type: GraphQLID},
    project: {
      type: require('./projectType'),
      async resolve(gapFile) {
        return await ProjectModel.findById(gapFile.project).exec()
      },
    },
    path: {
      type: GraphQLString,
    },
    assessmentComplete: {
      type: GraphQLBoolean,
    },
    keyConsiderations: {type: GraphQLList(GraphQLString)},
    criteria: {type: GraphQLList(GapFileCriterionType)},
    name: {
      type: GraphQLString,
    },
    uploadedBy: {
      type: UserType,
      async resolve(gapFile) {
        return await UserModel.findById(gapFile.updatedBy).exec()
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

module.exports = GapFileType
