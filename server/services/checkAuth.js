function checkAuth(isAuthenticated) {
  if (!isAuthenticated) {
    throw new Error("Not authenticated as user");
  }
}
function checkAuthAdmin(roles) {
  if (!roles.includes("Admin")) {
    throw new Error("Not authenticated as admin");
  }
}

module.exports = { checkAuth, checkAuthAdmin };
