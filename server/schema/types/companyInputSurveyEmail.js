const graphql = require('graphql')
const {
  GraphQLInputObjectType,
  GraphQLID,
  GraphQLString,
  GraphQLFloat,
} = graphql

const companyInputSurveyEmail = new GraphQLInputObjectType({
  name: 'companyInputSurveyEmail',
  fields: {
    internalEmailTemplate: {type: GraphQLString},
    internalReminderEmailTemplate: {type: GraphQLString},
    externalEmailTemplate: {type: GraphQLString},
    externalReminderEmailTemplate: {type: GraphQLString},
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
  },
})

module.exports = companyInputSurveyEmail
