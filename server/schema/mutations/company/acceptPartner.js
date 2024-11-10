// const mongoose = require('mongoose')
// const ObjectId = mongoose.Types.ObjectId
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
    partnerProjectId: {
      name: 'partnerProjectId',
      type: GraphQLID,
    },
    partnerAgencyId: {
      name: 'partnerAgencyId',
      type: GraphQLID,
    },
    companyId: {
      name: 'companyId',
      type: GraphQLID,
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    let agency = await AgencyModel.findOneAndUpdate({'_id': params.id, 'partners._id': params.partnerId},
      {$pull: {'partners.$.partnerRequestedProjects': params.projectId}}).exec()

    if (!agency) {
      throw new Error('Error agency not found')
    }

    agency = await AgencyModel.findOne({
      '_id': params.partnerAgencyId, 'partners.company': params.companyId}).exec()

    if (!agency) {
      agency = await AgencyModel.findOneAndUpdate({_id: params.partnerAgencyId},
        {$addToSet: {partners: {company: params.companyId}}}).exec()
    }

    agency = await AgencyModel.findOneAndUpdate({
      '_id': params.partnerAgencyId, 'partners.company': params.companyId},
    {$addToSet: {'partners.$.sharedProjects': params.partnerProjectId}}).exec()

    if (!agency) {
      throw new Error('Error agency not found')
    }

    let supplierCompany = await CompanyModel.findOne({
      '_id': params.companyId, 'suppliers.agency': params.id}).exec()

    if (!supplierCompany) {
      supplierCompany = await CompanyModel.findOneAndUpdate({
        _id: params.companyId}, {$addToSet: {suppliers: {agency: agency}}})
    }

    supplierCompany = await CompanyModel.findOneAndUpdate({'_id': params.companyId, 'suppliers.agency': agency},
      {$addToSet: {'suppliers.$.projects': params.projectId}}).exec()

    if (!supplierCompany) {
      throw new Error('Error company not found')
    }

    return supplierCompany
  },
}
