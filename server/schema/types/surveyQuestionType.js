const graphql = require('graphql')
const {
  GraphQLObjectType,
  GraphQLBoolean,
  GraphQLString,
  GraphQLInt,
} = graphql


const SurveyQuestionType = new GraphQLObjectType({
  name: 'SurveyQuestionType',
  fields: () => ({
    id: {type: GraphQLString},
    title: {type: GraphQLString},
    selected: {type: GraphQLBoolean},
    position: {type: GraphQLInt},
  }),
})

module.exports = SurveyQuestionType
