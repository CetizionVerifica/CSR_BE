const graphql = require('graphql')
const {
  GraphQLObjectType,
  GraphQLID,
  GraphQLBoolean,
  GraphQLString,
  GraphQLList,
  GraphQLFloat,
} = graphql
const UserType = require('./userType')
const UserModel = require('../../models/user')
const StakeholderModel = require('../../models/stakeholder')

const StakeholderType = new GraphQLObjectType({
  name: 'StakeholderType',
  fields: () => ({
    id: {type: GraphQLID},
    active: {type: GraphQLBoolean},
    isCompany: {type: GraphQLBoolean},
    companyName: {type: GraphQLString},
    name: {type: GraphQLString},
    jobPosition: {type: GraphQLString},
    email: {type: GraphQLString},
    phone: {type: GraphQLString},
    extention: {type: GraphQLString},
    fax: {type: GraphQLString},
    company: {
      type: require('./companyType'),
      resolve(parentValue) {
        return StakeholderModel.findById(parentValue).populate('company')
          .then(stakeholder => {
            return stakeholder.company
          })
      },
    },
    materiality: {
      type: new GraphQLList(require('./materialityType')),
      resolve(parentValue) {
        return StakeholderModel.findMateriality(parentValue.id)
      },
    },
    updatedBy: {
      type: UserType,
      async resolve(company) {
        return await UserModel.findById(company.updatedBy).exec()
      },
    },
    createdBy: {
      type: UserType,
      async resolve(company) {
        return await UserModel.findById(company.createdBy).exec()
      },
    },
    date: {
      type: GraphQLFloat,
      resolve({date}) {
        return date && date.getTime()
      },
    },
    updatedDate: {
      type: GraphQLFloat,
      resolve({updatedDate}) {
        return updatedDate && updatedDate.getTime()
      },
    },
  }),
})

module.exports = StakeholderType
