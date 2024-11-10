const {
  GraphQLNonNull,
  GraphQLID,
  GraphQLList,
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
      type: new GraphQLList(GraphQLNonNull(EmployeeInputType)),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const company = await CompanyModel.findById(params.id)
    if (!company) {
      throw new Error('Error company not found')
    }
    try {
      await params.data.map(async record => {
        const employeeData = Object.assign({}, record)
        const employeeModel = new EmployeeModel({...employeeData, company})
        const employee = await employeeModel.save()

        if (!employee) {
          throw new Error('Error creating company')
        }

        await updateItem({
          id: params.id,
          type: 'company',
          changes: {employees: [...company.employees, employee]},
          projection,
          userId: root.user._id,
        })
      })
    } catch (error) {
      throw new Error('Error creating employees')
    }

    return company
  },
}
