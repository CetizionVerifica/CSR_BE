module.exports = {
  addProject: require('./add'),
  removeProject: require('./remove'),
  addMateriality: require('./addMateriality'),
  updateProject: require('./update').updateProject,
  updateProjectTitle: require('./update').updateProjectTitle,
  activeProject: require('./update').activeProject,
  archiveProject: require('./update').archiveProject,
  changeProjectStatus: require('./update').changeProjectStatus,
  submitProjectAssessmentStatus: require('./update').submitProjectAssessmentStatus,
  changeSupplierFullAccess: require('./update').changeSupplierFullAccess,
  changeSupplierPhysicalAudit: require('./update').changeSupplierPhysicalAudit,
}
