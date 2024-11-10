const {
  GraphQLNonNull,
  GraphQLID,
} = require('graphql')
const CompanyType = require('../../types/companyType')
const CompanyModel = require('../../../models/company')
const AgencyModel = require('../../../models/agency')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: CompanyType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    partnerId: {
      name: 'partnerId',
      type: GraphQLID,
    },
    projectId: {
      name: 'projectId',
      type: GraphQLID,
    },
    companyId: {
      name: 'companyId',
      type: GraphQLID,
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const agency = await AgencyModel.findOneAndUpdate({'_id': params.id, 'partners._id': params.partnerId},
      {$pull: {'partners.$.sharedProjects': params.projectId}}).exec()

    if (!agency) {
      throw new Error('Error agency not found')
    }

    const supplierCompany = await CompanyModel.findOneAndUpdate({
      '_id': params.companyId, 'suppliers.agency': params.id},
    {$pull: {'suppliers.$.projects': params.projectId}}).exec()

    if (!supplierCompany) {
      throw new Error('Error company not found')
    }

    return supplierCompany
  },
}
