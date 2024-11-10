const graphql = require('graphql')
const {GraphQLSchema} = graphql

const RootQueryType = require('./queries')
const mutations = require('./mutations')

// const RootQueryType = require('./rootQueryType')
// const mutations = require('./mutations')

module.exports = new GraphQLSchema({
  query: RootQueryType,
  mutation: mutations,
})
