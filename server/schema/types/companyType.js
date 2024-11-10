const graphql = require('graphql')
const UserType = require('./userType')
const ProjectType = require('./projectType')
const EmployeeType = require('./employeeType')
const StakeholderType = require('./stakeholderType')
const ActionsAndKPIsType = require('./actionsAndKPIsType')
const SupplierType = require('./supplierType')
const UserModel = require('../../models/user')
const AgencyModel = require('../../models/agency')
const CompanyModel = require('../../models/company')

const {GraphQLObjectType,
  GraphQLString,
  GraphQLID,
  GraphQLFloat,
  GraphQLList,
} = graphql

const CompanyType = new GraphQLObjectType({
  name: 'CompanyType',
  fields: () => ({
    id: {type: GraphQLID},
    name: {type: GraphQLString},
    email: {type: GraphQLString},
    sector: {type: GraphQLString},
    type: {type: GraphQLString},
    lisence: {
      type: new GraphQLList(GraphQLString),
    },
    serviceProductInfo: {type: GraphQLString},
    percentageServiceProduct: {type: GraphQLString},
    website: {type: GraphQLString},
    country: {type: GraphQLString},
    phone: {type: GraphQLString},
    fax: {type: GraphQLString},
    personName: {type: GraphQLString},
    jobPosition: {type: GraphQLString},
    personEmail: {type: GraphQLString},
    personPhone: {type: GraphQLString},
    personExtetion: {type: GraphQLString},
    internalEmailTemplate: {type: GraphQLString},
    internalReminderEmailTemplate: {type: GraphQLString},
    externalEmailTemplate: {type: GraphQLString},
    externalReminderEmailTemplate: {type: GraphQLString},
    personFax: {type: GraphQLString},
    users: {type: new GraphQLList(UserType)},
    reseller: {type: GraphQLString},
    agency: {
      type: require('./agencyType'),
      async resolve(company) {
        return await AgencyModel.findById(company.agency).exec()
      },
    },
    projects: {
      type: new GraphQLList(ProjectType),
      resolve(parentValue) {
        return CompanyModel.findProjects(parentValue.id)
      },
    },
    employees: {
      type: new GraphQLList(EmployeeType),
      resolve(parentValue) {
        return CompanyModel.findEmployees(parentValue.id)
      },
    },
    suppliers: {
      type: new GraphQLList(SupplierType),
    },
    actionAndKPIs: {
      type: new GraphQLList(ActionsAndKPIsType),
      resolve(parentValue) {
        return CompanyModel.findActionsAndKPIs(parentValue.id)
      },
    },
    stakeholders: {
      type: new GraphQLList(StakeholderType),
      resolve(parentValue) {
        return CompanyModel.findStakeholders(parentValue.id)
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

module.exports = CompanyType
