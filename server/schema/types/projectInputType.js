const graphql = require("graphql");
const {
  GraphQLInputObjectType,
  GraphQLFloat,
  GraphQLString,
  GraphQLInt,
  GraphQLNonNull,
} = graphql;

const ProjectInputType = new GraphQLInputObjectType({
  name: "ProjectInputType",
  fields: () => ({
    title: { type: new GraphQLNonNull(GraphQLString) },
    reseller: { type: GraphQLString },
    year: { type: new GraphQLNonNull(GraphQLInt) },
    numberOfEmployees: { type: GraphQLInt },
    date: {
      type: new GraphQLNonNull(GraphQLFloat),
    },
    endDate: {
      type: GraphQLFloat,
    },
  }),
});

module.exports = ProjectInputType;
