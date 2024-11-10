const {clone} = require('lodash')
const {
  GraphQLObjectType,
  GraphQLSchema,
} = require('graphql')

const queries = require('./queries')
const mutations = require('./mutations')


class SchemaManager {
  constructor() {
    this.init()
  }

  async init() {
    this.queryFields = clone(queries)
    this.mutationFields = clone(mutations)
    this.createRoot()
  }

  processSchema(/* schema */) {
    // const type = schemaEntryType(schema);
    // const inputType = schemaEntryInputType(schema);
    //
    // const schemaQueries = {
    //   ['rlx_' + schema.slug]: schemaListQuery(type, schema),
    //   ['rlx_' + schema.slug + '_count']: schemaListCountQuery(type, schema)
    // };
    //
    // // TODO create mutations
    //
    // Object.assign(this.queryFields, schemaQueries);
  }

  createRoot() {
    this.rootQuery = new GraphQLObjectType({
      name: 'query',
      fields: () => (this.queryFields),
    })
    this.rootMutation = new GraphQLObjectType({
      name: 'mutation',
      fields: () => (this.mutationFields),
    })
  }

  getSchema() {
    const schema = {
      query: this.rootQuery,
    }
    if (Object.keys(this.mutationFields).length) {
      schema.mutation = this.rootMutation
    }
    return new GraphQLSchema(schema)
  }
}

module.exports = new SchemaManager()
