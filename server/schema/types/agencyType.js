const graphql = require('graphql')
//const ProjectType = require('./projectType')
const PartnerType = require('./partnerType')
const AgencyModel = require('../../models/agency')
const UserModel = require('../../models/user')
const {
  GraphQLObjectType,
  GraphQLID,
  GraphQLBoolean,
  GraphQLString,
  GraphQLNonNull,
  GraphQLList,
  GraphQLFloat,
} = graphql


const agencyType = new GraphQLObjectType({
  name: 'AgencyType',
  fields: () => ({
    id: {type: new GraphQLNonNull(GraphQLID)},
    email: {type: new GraphQLNonNull(GraphQLString)},
    name: {type: new GraphQLNonNull(GraphQLString)},
    descriptions: {type: GraphQLString},
    phone: {type: GraphQLString},
    country: {type: GraphQLString},
    website: {type: GraphQLString},
    industry: {type: GraphQLString},
    active: {type: GraphQLBoolean},
    logo: {type: GraphQLString},
    date: {
      type: GraphQLFloat,
      resolve({date}) {
        return date && date.getTime()
      },
    },
    partners: {
      type: new GraphQLList(PartnerType),
    },
    projects: {
      type: new GraphQLList(require('./projectType')),
      resolve(parentValue) {
        return AgencyModel.findProjects(parentValue.id)
      },
    },
   // reseller: {
   //   type: require('./userType'),
   // },
    companies: {
      type: new GraphQLList(require('./companyType')),
      resolve(parentValue) {
        return AgencyModel.findCompanies(parentValue.id)
      },
    },
    users: {
      type: new GraphQLList(require('./userType')),
      resolve(parentValue) {
        return AgencyModel.findUsers(parentValue.id)
      },
    },
    updatedBy: {
      type: require('./userType'),
      async resolve(agency) {
        return await UserModel.findById(agency.updatedBy).exec()
      },
    },
    createdBy: {
      type: require('./userType'),
      async resolve(agency) {
        return await UserModel.findById(agency.createdBy).exec()
      },
    },
  }),
})

module.exports = agencyType

