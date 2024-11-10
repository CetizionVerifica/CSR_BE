const project = require('./project')
const projects = require('./projects').projects
const projectsByYear = require('./projectsByYear')
const projectsByStatus = require('./projects').projectsByStatus
const allProjects = require('./projects').allProjects
module.exports = {
  project,
  projects,
  projectsByYear,
  projectsByStatus,
  allProjects
}
