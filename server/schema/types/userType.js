const graphql = require('graphql')
//const ProjectType = require('./projectType')
const UserModel = require('../../models/user')
const AgencyModel = require('../../models/agency')
const {
  GraphQLObjectType,
  GraphQLID,
  GraphQLBoolean,
  GraphQLString,
  GraphQLNonNull,
  GraphQLList,
  GraphQLFloat,
} = graphql


const userType = new GraphQLObjectType({
  name: 'UserType',
  fields: () => ({
    _id: {type: new GraphQLNonNull(GraphQLID)},
    email: {type: new GraphQLNonNull(GraphQLString)},
    currentAgency: {
      type: require('./agencyType'),
      async resolve(user) {
        return await AgencyModel.findById(user.currentAgency).exec()
      },
    },
    name: {type: GraphQLString},
    jobPosition: {type: GraphQLString},
    role: {type: GraphQLString},
    phone: {type: GraphQLString},
    extension: {type: GraphQLString},
    lang: {type: GraphQLString},
    active: {type: GraphQLBoolean},
    termsAndConditions: {type: GraphQLBoolean},
    date: {
      type: GraphQLFloat,
      resolve({date}) {
        return date && date.getTime()
      },
    },
    companies: {
      type: new GraphQLList(require('./companyType')),
      resolve(parentValue) {
        return UserModel.findCompanies(parentValue.id)
      },
    },
    agencies: {
      type: new GraphQLList(require('./agencyType')),
      resolve(parentValue) {
        return UserModel.findAgencies(parentValue.id)
      },
    },

  }),
})

module.exports = userType
