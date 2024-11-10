const graphql = require('graphql')
const {
  GraphQLObjectType,
  GraphQLList,
  GraphQLID,
  GraphQLString,
} = graphql
const SurveyQuestionType = require('./surveyQuestionType')


const SurveyType = new GraphQLObjectType({
  name: 'SurveyType',
  fields: () => ({
    id: {type: GraphQLID},
    title: {type: GraphQLString},
    surveyId: {type: GraphQLString},
    previewLink: {type: GraphQLString},
    editUrl: {type: GraphQLString},
    flag: {type: GraphQLString},
    questions: {
      type: GraphQLList(SurveyQuestionType),
      resolve(survey) {
        return survey.questions
      },
    },
    createdDate: {
      type: GraphQLString,
      resolve({createdDate}) {
        return createdDate && `${createdDate.getDate()}/${createdDate.getMonth() + 1}/${createdDate.getFullYear()}`
      },
    },
    modifiedDate: {
      type: GraphQLString,
      resolve({modifiedDate}) {
        return modifiedDate && `${modifiedDate.getDate()}/${modifiedDate.getMonth() + 1}/${modifiedDate.getFullYear()}`
      },
    },
  }),
})

module.exports = SurveyType
