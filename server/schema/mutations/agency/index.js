module.exports = {
  addAgency: require('./add'),
  removeAgency: require('./remove'),
  updateAgency: require('./update').updateAgency,
  updateAgencyById: require('./update').updateAgencyById,
  removeUserFromAgency: require('./update').removeUserFromAgency,
  addSupplier: require('./suppliers').addSupplier,
  removePartner: require('./removePartner'),
  removeCompanyFromSupplier: require('./suppliers').removeCompanyFromSupplier,
}
