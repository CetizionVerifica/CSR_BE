const {forEach} = require('lodash')
const graphql = require('graphql')
const filterType = require('./types/filterType')
const {GraphQLString, GraphQLInt, GraphQLList} = graphql
const paginationQueryArgs = {
  sort: {
    name: 'sort',
    type: GraphQLString,
  },
  order: {
    name: 'order',
    type: GraphQLString,
  },
  limit: {
    name: 'limit',
    type: GraphQLInt,
  },
  filters: {
    name: 'filters',
    type: new GraphQLList(filterType),
  },
  page: {
    name: 'page',
    type: GraphQLInt,
  },
  search: {
    name: 'search',
    type: GraphQLString,
  },
  s: {
    name: 's',
    type: GraphQLString,
  },
}

const parseFilterOperation = (op) => {
  const result = {}
  forEach(op, (value, key) => {
    result[`$${key}`] = value
  })
  return result
}

const searchQuery = (find, params) => {
  const and = []

  // Search
  if (params.search && params.s) {
    and.push({
      [params.search]: new RegExp(`.*${params.s}`, 'i'),
    })
  }

  // Filters
  if (params.filters && params.filters.constructor === Array) {
    forEach(params.filters, (filter) => {
      and.push({
        [filter.property]: parseFilterOperation(filter.op),
      })
    })
  }

  // apply and operator with all the filters
  if (and.length > 0) {
    Object.assign(find, {
      $and: and,
    })
  }
  return find
}

const paginateQuery = (query, params) => {
  if (params.sort) {
    query.sort({
      [params.sort]: params.order || 'asc',
    })
  }
  if (params.page && params.limit) {
    query.skip((params.page - 1) * params.limit)
  }
  if (params.limit) {
    query.limit(params.limit)
  }
}

module.exports = {
  paginationQueryArgs,
  searchQuery,
  paginateQuery,
}
