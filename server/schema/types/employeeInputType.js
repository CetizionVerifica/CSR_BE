
const graphql = require('graphql')
const {
  GraphQLInputObjectType,
  GraphQLID,
  GraphQLString,
  GraphQLBoolean,
  GraphQLFloat,
} = graphql


const EmployeeInputType = new GraphQLInputObjectType({
  name: 'EmployeeInputType',
  fields: () => ({
    active: {type: GraphQLBoolean},
    name: {type: GraphQLString},
    jobPosition: {type: GraphQLString},
    email: {type: GraphQLString},
    phone: {type: GraphQLString},
    extention: {type: GraphQLString},
    fax: {type: GraphQLString},
    date: {
      type: GraphQLFloat,
      default: Date.now,
    },
    updatedDate: {
      type: GraphQLFloat,
      default: Date.now,
    },
    updatedBy: {type: GraphQLID},
    createdBy: {type: GraphQLID},
  }),
})

module.exports = EmployeeInputType
