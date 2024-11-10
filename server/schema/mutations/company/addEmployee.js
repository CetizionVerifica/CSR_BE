const {
  GraphQLNonNull,
  GraphQLID,
} = require('graphql')
const getProjection = require('../../../helpers/getProjection')
const EmployeeInputType = require('../../types/employeeInputType')
const EmployeeModel = require('../../../models/employee')
const CompanyType = require('../../types/companyType')
const CompanyModel = require('../../../models/company')
const updateItem = require('../_helper/updateItem')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: CompanyType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    data: {
      name: 'data',
      type: new GraphQLNonNull(EmployeeInputType),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const company = await CompanyModel.findById(params.id)
    if (!company) {
      throw new Error('Error company not found')
    }
    const employeeData = Object.assign({}, params.data)
    const employeeModel = new EmployeeModel({...employeeData, company})
    const employee = await employeeModel.save()

    if (!employee) {
      throw new Error('Error creating company')
    }

    const {item} = await updateItem({
      id: params.id,
      type: 'company',
      changes: {employees: [...company.employees, employee]},
      projection,
      userId: root.user._id,
    })
    return item
  },
}
