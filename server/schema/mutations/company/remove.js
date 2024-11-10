const {
  GraphQLNonNull,
  GraphQLID,
} = require('graphql')

const CompanyType = require('../../types/companyType')
const CompanyModel = require('../../../models/company')
const EmployeeModel = require('../../../models/employee')
const StakeholderModel = require('../../../models/stakeholder')
const ProjectModel = require('../../../models/project')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: CompanyType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
  },
  async resolve(root, params, context) {
    checkAuth(context.isAuthenticated())

    const projects = await ProjectModel.find({company: params.id}).count().exec()
    if (projects > 0) {
      throw new Error('Error removing company has projects')
    }
    const removedCompany = await CompanyModel
      .findByIdAndRemove(params.id).exec()

    if (!removedCompany) {
      throw new Error('Error removing Company')
    }
    await EmployeeModel.find({company: removedCompany._id}).remove()
    await StakeholderModel.find({company: removedCompany._id}).remove()
    return removedCompany
  },
}
