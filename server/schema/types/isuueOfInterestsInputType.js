const graphql = require('graphql')
const {
  GraphQLInputObjectType,
  GraphQLInt,
  GraphQLString,
  GraphQLNonNull,
} = graphql


const IsuueOfInterestInputType = new GraphQLInputObjectType({
  name: 'IsuueOfInterestInputType',
  fields: () => ({
    coreSubject: {type: new GraphQLNonNull(GraphQLString)},
    isuueOfInterest: {type: new GraphQLNonNull(GraphQLString)},
    weight: {type: GraphQLInt},
    note: {type: GraphQLString},
  }),
})

module.exports = IsuueOfInterestInputType
