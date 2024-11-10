const GraphQLJSON = require('graphql-type-json')
const {
  GraphQLObjectType,
  GraphQLNonNull,
  GraphQLInt,
  GraphQLFloat,
  GraphQLID,
} = require('graphql')

const userType = require('./userType')
const UserModel = require('../../models/user')

const RevisionType = new GraphQLObjectType({
  name: 'RevisionType',
  fields: {
    _id: {
      type: new GraphQLNonNull(GraphQLID),
    },
    version: {
      type: GraphQLInt,
    },
    itemId: {
      type: GraphQLInt,
    },
    date: {
      type: GraphQLFloat,
      resolve({date}) {
        return date && date.getTime()
      },
    },
    doc: {
      type: new GraphQLNonNull(GraphQLJSON),
    },
    user: {
      type: userType,
      async resolve(revision) {
        return await UserModel.findById(revision.user).exec()
      },
    },
  },
})

module.exports = RevisionType
