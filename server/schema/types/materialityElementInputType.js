
const graphql = require('graphql')
const {
  GraphQLInputObjectType,
  GraphQLString,
  GraphQLNonNull,
  GraphQLFloat,
  GraphQLInt,
} = graphql

const MIssueOfInterestInputType = new GraphQLInputObjectType({
  name: 'MIssueOfInterestInputType',
  fields: () => ({
    issueOfInterest: {type: new GraphQLNonNull(GraphQLString)},
    rating: {type: GraphQLFloat},
  }),
})

const MCoreSubjectInputType = new GraphQLInputObjectType({
  name: 'MCoreSubjectInputType',
  fields: () => ({
    coreSubject: {type: new GraphQLNonNull(GraphQLString)},
    relevanceValue: {type: GraphQLFloat},
    rating: {type: GraphQLInt},
  }),
})


const MStakeholderInputType = new GraphQLInputObjectType({
  name: 'MStakeholderInputType',
  fields: () => ({
    groupXFactor: {type: GraphQLFloat},
  }),
})

module.exports = {
  MIssueOfInterestInputType,
  MCoreSubjectInputType,
  MStakeholderInputType,
}

