const graphql = require('graphql')
const {
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
} = graphql
const RecipientType = require('./recipientType')

const SendSurveyType = new GraphQLObjectType({
  name: 'SendSurveyType',
  fields: () => ({
    collectorId: {type: GraphQLString},
    recipients: {
      type: GraphQLList(RecipientType),
      resolve({recipients}) {
        return recipients
      },
    },
  }),
})

module.exports = SendSurveyType
