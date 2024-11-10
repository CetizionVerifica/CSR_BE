const getProjection = require('../../../helpers/getProjection')
const {
  GraphQLNonNull,
  GraphQLID,
} = require('graphql')
// const AgencyInputType = require('../../types/agencyInputType')
const AgencyType = require('../../types/agencyType')
const updateItem = require('../_helper/updateItem')
// const UserModel = require('../../../models/user')
const AgencyModel = require('../../../models/agency')
const CompanyModel = require('../../../models/company')
const {checkAuth} = require('../../../services/checkAuth')

const addSupplier = {
  type: AgencyType,
  args: {
    agencyId: {
      name: 'agencyId',
      type: new GraphQLNonNull(GraphQLID),
    },
    companyId: {
      name: 'companyId',
      type: new GraphQLNonNull(GraphQLID),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])

    const agency = await AgencyModel.findById(params.agencyId)
    if (!agency) {
      throw new Error('Error agency not found')
    }
    const company = await CompanyModel.findById(params.companyId)

    if (!company) {
      throw new Error('Error company not found')
    }
    await updateItem({
      id: params.companyId,
      type: 'company',
      changes: {$push: {partnerAgency: params.agencyId}},
      projection,
      userId: root.user._id,
    })
    const {item} = await updateItem({
      id: params.agencyId,
      type: 'agency',
      changes: {$push: {supplierCompanies: params.companyId}},
      projection,
      userId: root.user._id,
    })
    return item
  },
}

const removeCompanyFromSupplier = {
  type: AgencyType,
  args: {
    agencyId: {
      name: 'agencyId',
      type: new GraphQLNonNull(GraphQLID),
    },
    companyId: {
      name: 'companyId',
      type: new GraphQLNonNull(GraphQLID),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const agency = await AgencyModel.findById(params.agencyId)
    if (!agency) {
      throw new Error('Error agency not found')
    }
    const company = await CompanyModel.findById(params.companyId)

    if (!company) {
      throw new Error('Error company not found')
    }
    await updateItem({
      id: params.companyId,
      type: 'company',
      changes: {$pull: {partnerAgency: params.agencyId}},
      projection,
      userId: root.user._id,
    })
    const {item} = await updateItem({
      id: params.agencyId,
      type: 'agency',
      changes: {$pull: {supplierCompanies: params.companyId}},
      projection,
      userId: root.user._id,
    })
    return item
  },
}


module.exports = {
  addSupplier,
  removeCompanyFromSupplier,
}
