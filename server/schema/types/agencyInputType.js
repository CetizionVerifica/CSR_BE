const graphql = require("graphql");
const { GraphQLInputObjectType, GraphQLString, GraphQLNonNull } = graphql;

const agencyInputType = new GraphQLInputObjectType({
  name: "AgencyInputType",
  fields: {
    email: { type: new GraphQLNonNull(GraphQLString) },
    name: { type: new GraphQLNonNull(GraphQLString) },
    descriptions: { type: GraphQLString },
    phone: { type: GraphQLString },
    country: { type: GraphQLString },
    website: { type: GraphQLString },
    industry: { type: GraphQLString },
  },
});
module.exports = agencyInputType;
