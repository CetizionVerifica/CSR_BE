const mongoose = require('mongoose')
const graphql = require('graphql')
const {
  GraphQLObjectType,
  GraphQLID,
  GraphQLString,
  GraphQLBoolean,
  GraphQLFloat,
} = graphql
const UserType = require('./userType')
const UserModel = require('../../models/user')
const Employee = mongoose.model('employee')


const EmployeeType = new GraphQLObjectType({
  name: 'EmployeeType',
  fields: () => ({
    id: {type: GraphQLID},
    active: {type: GraphQLBoolean},
    name: {type: GraphQLString},
    jobPosition: {type: GraphQLString},
    email: {type: GraphQLString},
    phone: {type: GraphQLString},
    extention: {type: GraphQLString},
    fax: {type: GraphQLString},
    company: {
      type: require('./companyType'),
      resolve(parentValue) {
        return Employee.findById(parentValue).populate('company')
          .then(employee => {
            return employee.company
          })
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

module.exports = EmployeeType
