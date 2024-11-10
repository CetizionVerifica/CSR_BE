const CompanyType = require('../../types/companyType')
const CompanyModel = require('../../../models/company')
const {GraphQLString, GraphQLList} = require('graphql')
const {checkAuth} = require('../../../services/checkAuth')
// const ObjectId = mongoose.Types.ObjectId

module.exports = {
  type: CompanyType,
  args: {
    project: {
      name: 'project',
      type: GraphQLString,
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    var company = null;
    try {
      // console.log("Comp", company, params.project);
      company = await CompanyModel.findOne({projects: params.project})
    } catch (error) {
      console.log("Error:", error.message);
    }

    return company
  },
}

