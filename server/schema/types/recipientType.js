const graphql = require('graphql')
const {
  GraphQLObjectType,
  GraphQLID,
  GraphQLString,
  GraphQLFloat,
} = graphql


const RecipientType = new GraphQLObjectType({
  name: 'RecipientType',
  fields: () => ({
    id: {type: GraphQLID},
    stakeholder: {type: GraphQLID},
    name: {type: GraphQLString},
    jobPosition: {type: GraphQLString},
    email: {type: GraphQLString},
    phone: {type: GraphQLString},
    company: {type: GraphQLString},
    responseDate: {
      type: GraphQLFloat,
      resolve({responseDate}) {
        return responseDate && responseDate.getTime()
      },
    },
    status: {type: GraphQLString},
  }),
})

module.exports = RecipientType
