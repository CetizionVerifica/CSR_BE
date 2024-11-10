const graphql = require('graphql')
const {
  GraphQLInputObjectType,
  GraphQLID,
  GraphQLBoolean,
  GraphQLString,
  GraphQLNonNull,
} = graphql


const StakeholderInputType = new GraphQLInputObjectType({
  name: 'StakeholderInputType',
  fields: () => ({
    id: {type: GraphQLID},
    active: {type: GraphQLBoolean},
    isCompany: {type: GraphQLBoolean},
    companyName: {type: new GraphQLNonNull(GraphQLString)},
    name: {type: new GraphQLNonNull(GraphQLString)},
    jobPosition: {type: new GraphQLNonNull(GraphQLString)},
    email: {type: new GraphQLNonNull(GraphQLString)},
    phone: {type: GraphQLString},
    extention: {type: GraphQLString},
    fax: {type: GraphQLString},
  }),
})

module.exports = StakeholderInputType
