
module.exports = {
  addUser: require('./add'),
  forgotPassword: require('./forgotPassword'),
  removeUser: require('./remove'),
  addUserToOrganisation: require('./update').addUserToOrganisation,
  updateUser: require('./update').updateUserData,
  activeUser: require('./update').activeUser,
  updateUserById: require('./update').updateUserDataById,
  updateUserEmail: require('./update').updateUserEmail,
  updateUserPassword: require('./update').updateUserPassword,
  updateNewUserPassword: require('./update').updateNewUserPassword,
  updateLanguageUser: require('./update').updateLanguageUser,
  updateCurrentAgencyUser: require('./update').updateCurrentAgencyUser,
  acceptTermsAndConditionsUser: require('./update').acceptTermsAndConditionsUser,
}
