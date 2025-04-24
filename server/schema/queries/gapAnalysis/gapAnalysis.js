const { GraphQLID } = require("graphql");
const getProjection = require("../../../helpers/getProjection");
const GapAnalysisType = require("../../types/gapAnalysisType");
const GapAnalysisModel = require("../../../models/gapAnalysis");
const { checkAuth } = require("../../../services/checkAuth");

module.exports = {
  type: GapAnalysisType,
  args: {
    id: {
      name: "id",
      type: GraphQLID,
    },
  },
  async resolve(parentValue, params, context, options) {
    checkAuth(context.isAuthenticated());

    const projection = getProjection(options.fieldNodes[0]);
    let id = params.id;
    //console.log("id",id)
    console.log("parentValue", parentValue);
    if (!id) {
      id = parentValue.user._id;
    }
    const gap = await GapAnalysisModel.findById(id).select(projection);
    return gap;
  },
};
