const {
  GraphQLNonNull,
} = require('graphql')
const RequestSupplierType = require('../../types/requestSupplierType')
const AgencyType = require('../../types/agencyType')
const AgencyModel = require('../../../models/agency')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: AgencyType,
  args: {
    data: {
      name: 'data',
      type: new GraphQLNonNull(RequestSupplierType),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    let agency = await AgencyModel.findOne({
      '_id': params.data.id, 'partners.company': params.data.companyId}).exec()

    if (!agency) {
      agency = await AgencyModel.findOneAndUpdate({_id: params.data.id},
        {$addToSet: {partners: {company: params.data.companyId}}}).exec()
    }

    if (!agency) {
      throw new Error('Error agency')
    }

    agency = await AgencyModel.findOneAndUpdate({'_id': params.data.id, 'partners.company': params.data.companyId},
      {$addToSet: {'partners.$.partnerRequestedProjects': params.data.projectId}}).exec()

    if (!agency) {
      throw new Error('Error company')
    }

    return agency
  },
}


