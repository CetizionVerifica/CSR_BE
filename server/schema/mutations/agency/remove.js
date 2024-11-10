const {
  GraphQLNonNull,
  GraphQLID,
} = require('graphql')

const AgencyType = require('../../types/agencyType')
const AgencyModel = require('../../../models/agency')
const CompanyModel = require('../../../models/company')
const ProjectModel = require('../../../models/project')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: AgencyType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
  },
  async resolve(root, params, context) {
    checkAuth(context.isAuthenticated())

    const removeAgency = await AgencyModel
      .findByIdAndRemove(params.id).exec()

    if (!removeAgency) {
      throw new Error('Error removing agency')
    }
    await CompanyModel.find({agency: removeAgency._id}).remove()
    await ProjectModel.find({agency: removeAgency._id}).remove()
    return removeAgency
  },
}
