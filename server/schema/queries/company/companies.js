const { GraphQLList } = require("graphql");
const getProjection = require("../../../helpers/getProjection");
const CompanyType = require("../../types/companyType");
const CompanyModel = require("../../../models/company");
const {
  paginationQueryArgs,
  paginateQuery,
  searchQuery,
} = require("../../queryPagination");
const { checkAuth } = require("../../../services/checkAuth");

module.exports = {
  type: new GraphQLList(CompanyType),
  args: {
    ...paginationQueryArgs,
  },
  async resolve(parentValue, params, context, options) {
    checkAuth(context.isAuthenticated());

    if (context.user.role.split("|").includes("Admin")) {
      const companies = await CompanyModel.find().populate("users");

      return companies;
    } else if (context.user.role.split("|").includes("Client")) {
      //const companies = await CompanyModel.find({createdBy: context.user._id}).populate('users')
      const companies = await CompanyModel.find({
        agency: parentValue.user.currentAgency,
      }).populate("users");

      return companies;
    } else if (context.user.role.split("|").includes("Reseller")) {
      const companies = await CompanyModel.find({
        reseller: context.user._id,
      }).populate("users");

      return companies;
    }
  },
};

// module.exports = {
//   type: new GraphQLList(CompanyType),
//   args: {
//     ...paginationQueryArgs,
//   },
//   resolve(parentValue, params, context, options) {
//     checkAuth(context.isAuthenticated())

//     const projection = getProjection(options.fieldNodes[0])
//     const query = CompanyModel.find(searchQuery({agency: parentValue.user.currentAgency}, params))
//     paginateQuery(query, params)
//     return query.select(projection).exec()
//   },
// }
