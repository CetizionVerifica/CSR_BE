const getProjection = require('../../../helpers/getProjection')
const {
  GraphQLNonNull,
  GraphQLID,
} = require('graphql')
const GapFileInputType = require('../../types/gapFileInputType')
const GapFileType = require('../../types/gapFileType')
const updateItem = require('../_helper/updateItem')
const GapFileModel = require('../../../models/gapFile')
const {checkAuth} = require('../../../services/checkAuth')

const {
  updateCriteria,
} = require('./_helper')


const updateFile = {
  type: GapFileType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    data: {
      name: 'data',
      type: new GraphQLNonNull(GapFileInputType),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    if (root.user.role !== 'Admin') {
      return null
    }

    const projection = getProjection(options.fieldNodes[0])

    const gapFile = await GapFileModel.findById(params.id)
    if (!gapFile || gapFile.assessmentComplete) {
      throw new Error('Error gapFile not found')
    }

    const gapFileData = Object.assign({}, params.data)
    const criteria = updateCriteria(gapFile, gapFileData)

    const {item} = await updateItem({
      id: params.id,
      type: 'gapFile',
      changes: {
        criteria: criteria,
      },
      projection,
      userId: root.user._id,
    })
    return item
  },
}

module.exports = {
  updateFile,
}
