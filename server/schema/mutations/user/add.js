const { GraphQLNonNull, GraphQLString } = require("graphql");
const getProjection = require("../../../helpers/getProjection");
const userInputType = require("../../types/userInputType");
const userType = require("../../types/userType");
const UserModel = require("../../../models/user");
const AgencyModel = require("../../../models/agency");
const CompanyModel = require("../../../models/company");
const { checkAuth } = require("../../../services/checkAuth");

module.exports = {
  type: userType,
  args: {
    password: {
      name: "password",
      type: new GraphQLNonNull(GraphQLString),
    },
    data: {
      name: "data",
      type: new GraphQLNonNull(userInputType),
    },
  },
  async resolve(root, params, context, options) {
    // Check if the user is authenticated
    // checkAuth(context.isAuthenticated());

    const { agencies, companies, email } = params.data;

    const agencyId = agencies[0];
    const companyId = companies[0];
    // Extract the projection
    const projection = getProjection(options.fieldNodes[0]);

    // Validate agency and company
    const agency = await AgencyModel.findById(agencyId);
    if (!agency) {
      throw new Error("Error: Agency not found");
    }

    const company = await CompanyModel.findById(companyId);
    if (!company) {
      throw new Error("Error: Company not found");
    }
    // Check for existing user by email
    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      throw new Error("Error: This user already exists");
    }
    console.log("47", company);

    // Prepare user data
    const userData = {
      ...params.data,
      createdBy: root.user._id,
      updatedBy: root.user._id,
      password: params.password,
      currentAgency: agencyId,
      agencies: [agencyId],
      companies: [companyId],
      active: true,
      reseller: company.reseller,
    };
    // Save the new user
    const userModel = new UserModel(userData);
    const user = await userModel.save();

    return user;
  },
};
