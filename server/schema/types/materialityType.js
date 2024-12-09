const mongoose = require('mongoose')
const graphql = require('graphql')
const {
  GraphQLObjectType,
  GraphQLID,
  GraphQLFloat,
  GraphQLList,
} = graphql
const UserType = require('./userType')
const UserModel = require('../../models/user')
const Materiality = mongoose.model('materiality')
const {MaterialityStakeholderType,
  MaterialityCoreSubjectType} = require('./materialityElementType')

const MaterialityType = new GraphQLObjectType({
  name: 'MaterialityType',
  fields: () => ({
    id: {type: GraphQLID},
    project: {
      type: require('./projectType'),
      async resolve(parentValue) {
        const materiality = await Materiality.findById(parentValue).populate('project')
        return materiality.project
      },
    },
    stakeholders: {type: GraphQLList(MaterialityStakeholderType)},
    coreSubjects: {type: GraphQLList(MaterialityCoreSubjectType)},
    updatedBy: {
      type: UserType,
      async resolve(company) {
        return await UserModel.findById(company.updatedBy).exec()
      },
    },
    createdBy: {
      type: UserType,
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

module.exports = MaterialityType
