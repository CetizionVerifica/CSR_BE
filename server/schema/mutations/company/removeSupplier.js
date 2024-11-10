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
    supplierId: {
      name: 'supplierId',
      type: GraphQLID,
    },
    projectId: {
      name: 'projectId',
      type: GraphQLID,
    },
    agencyId: {
      name: 'agencyId',
      type: GraphQLID,
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const company = await CompanyModel.findOneAndUpdate({'_id': params.id, 'suppliers._id': params.supplierId},
      {$pull: {'suppliers.$.projects': params.projectId}}).exec()

    if (!company) {
      throw new Error('Error company not found')
    }

    await ProjectModel.findOneAndUpdate({_id: params.projectId},
      {$pull: {supplierProperties: {supplier: params.supplierId}}})

    const agency = await AgencyModel.findOneAndUpdate({'_id': params.agencyId, 'partners.company': company.id},
      {$pull: {'partners.$.sharedProjects': params.projectId,
        'partners.$.showProjectResults': params.projectId}}).exec()

    if (!agency) {
      throw new Error('Error agency not found')
    }

    return agency
  },
}
