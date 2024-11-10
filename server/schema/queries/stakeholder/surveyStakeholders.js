const {GraphQLList, GraphQLID, GraphQLNonNull, GraphQLString} = require('graphql')
const StakeholderType = require('../../types/stakeholderType')
const StakeholderModel = require('../../../models/stakeholder')
const EmployeeModel = require('../../../models/employee')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: new GraphQLList(StakeholderType),
  args: {
    companyId: {
      name: 'company',
      type: new GraphQLNonNull(GraphQLID),
    },
    type: {
      name: 'type',
      type: new GraphQLNonNull(GraphQLString),
    },
  },
  resolve(parentValue, params, context, options) {
    checkAuth(context.isAuthenticated())

    const query = params.type === 'internal' ?
      EmployeeModel.find({company: params.companyId, active: true}) :
      StakeholderModel.find({company: params.companyId, active: true, isCompany: false})

    return query.exec()
  },
}
