const graphql = require('graphql')
const {
  GraphQLObjectType,
  GraphQLList,
  GraphQLInt,
  GraphQLString,
} = graphql
const ProjectModel = require('../../models/project')


const partnerType = new GraphQLObjectType({
  name: 'PartnerType',
  fields: () => ({
    id: {
      type: GraphQLString,
      resolve(partner) {
        return partner._id
      },
    },
    partnerCompany: {
      type: require('./companyType'),
      async resolve(partner) {
        return partner.company
      },
    },
    projects: {
      type: new GraphQLList(require('./projectType')),
      resolve(partner) {
        return partner.sharedProjects
      },
    },
    requestedYears: {
      type: new GraphQLList(GraphQLInt),
      resolve(partner) {
        return partner.requestedYears
      },
    },
    partnerRequestedProjects: {
      type: new GraphQLList(require('./projectType')),
      resolve(partner) {
        // console.log(partner)
        return ProjectModel.find({_id: {$in: partner.partnerRequestedProjects}}).exec()
      },
    },
    showProjectResults: {
      type: new GraphQLList(require('./projectType')),
      resolve(partner) {
        return partner.showProjectResults
      },
    },
  }),
})

module.exports = partnerType

