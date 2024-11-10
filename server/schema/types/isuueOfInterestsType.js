const graphql = require('graphql')
const {
  GraphQLObjectType,
  GraphQLInt,
  GraphQLString,
} = graphql


const IsuueOfInterestsType = new GraphQLObjectType({
  name: 'IsuueOfInterestsType',
  fields: () => ({
    coreSubject: {type: GraphQLString},
    isuueOfInterest: {type: GraphQLString},
    weight: {type: GraphQLInt},
    note: {type: GraphQLString},
  }),
})

module.exports = IsuueOfInterestsType
