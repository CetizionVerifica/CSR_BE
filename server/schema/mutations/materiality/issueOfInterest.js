const getProjection = require('../../../helpers/getProjection')
const {
  GraphQLNonNull,
  GraphQLID,
  GraphQLString,
} = require('graphql')
const {find} = require('lodash')
const IsuueOfInterestInputType = require('../../types/isuueOfInterestsInputType')
const MaterialityType = require('../../types/materialityType')
const MaterialityModel = require('../../../models/materiality')
const updateItem = require('../_helper/updateItem')
const {checkAuth} = require('../../../services/checkAuth')


const materialityIssueOfInterest = {
  type: MaterialityType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    data: {
      name: 'data',
      type: new GraphQLNonNull(IsuueOfInterestInputType),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const materialityModel = await MaterialityModel.findById(params.id)

    const isuueOfInterest = find(materialityModel.isuueOfInterests,
      ['isuueOfInterest', params.data.isuueOfInterest])

    if (isuueOfInterest) {
      if (params.data.weight !== undefined) {
        isuueOfInterest.weight = params.data.weight
      }
      if (params.data.note) {
        isuueOfInterest.note = params.data.note

      }
      const {item} = await updateItem({
        id: params.id,
        type: 'materiality',
        changes: {isuueOfInterests: [...materialityModel.isuueOfInterests]},
        projection,
        userId: root.user._id,
      })
      return item
    } else {
      const {item} = await updateItem({
        id: params.id,
        type: 'materiality',
        changes: {isuueOfInterests: [...materialityModel.isuueOfInterests, params.data]},
        projection,
        userId: root.user._id,
      })
      return item
    }

  },
}

const removeMaterialityIssueOfInterest = {
  type: MaterialityType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    isuueOfInterest: {
      name: 'isuueOfInterest',
      type: new GraphQLNonNull(GraphQLString),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const materiality = await MaterialityModel
      .findByIdAndUpdate(params.id,
        {$pull: {isuueOfInterests: {isuueOfInterest: params.isuueOfInterest}}})
      .select(projection)
      .exec()

    if (!materiality) {
      throw new Error('Error removing materiality')
    }
    return materiality

  },
}
module.exports = {
  materialityIssueOfInterest,
  removeMaterialityIssueOfInterest,
}
