const getProjection = require('../../../helpers/getProjection')
// const {round, sumBy, meanBy} = require('lodash')
const {
  GraphQLNonNull,
  GraphQLID,
} = require('graphql')
const GapAnalysisInputType = require('../../types/gapAnalysisInputType')
const GapAnalysisType = require('../../types/gapAnalysisType')
const updateItem = require('../_helper/updateItem')
const GapAnalysisModel = require('../../../models/gapAnalysis')
const GapFileModel = require('../../../models/gapFile')
const { checkAuth } = require('../../../services/checkAuth')

const {
  updateCoreSubjects,
  getKeyConsiderationFile,
} = require('./_helper')


const updateGapAnalysis = {
  type: GapAnalysisType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    data: {
      name: 'data',
      type: new GraphQLNonNull(GapAnalysisInputType),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])

    const gapAnalysis = await GapAnalysisModel.findById(params.id)

    if (!gapAnalysis) {
      throw new Error('Error gapAnalysis not found')
    }
    const gapAnalysisData = Object.assign({}, params.data)
    const existingFileId = getKeyConsiderationFile(gapAnalysis, gapAnalysisData)
    const coreSubjects = updateCoreSubjects(gapAnalysis, gapAnalysisData)
    const { item } = await updateItem({
      id: params.id,
      type: 'gapAnalysis',
      changes: {
        coreSubjects: coreSubjects,
      },
      projection,
      userId: root.user._id,
    })

    // If key consideration relevance is 0 remove related file reference
    if (existingFileId && gapAnalysisData.relevanceValue === 0) {
      await GapFileModel.updateOne(
        { _id: existingFileId },
        {
          $pull: {
            keyConsiderations: gapAnalysisData.keyConsideration,
            criteria: { name: gapAnalysisData.keyConsideration },
          }
        }
      )
    }

   /*
   //Performance Changes
   for (let i = 0; i < item.coreSubjects.length; i++) {
      if (item.coreSubjects[i].coreSubject == params.data.coreSubject) {
        const current = item.coreSubjects[i]
        item.coreSubjects = []
        item.coreSubjects.push(current)

      }


    }*/

    return item
  },
}

const updateGapAnalysisFile = {
  type: GapAnalysisType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    data: {
      name: 'data',
      type: new GraphQLNonNull(GapAnalysisInputType),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])

    const gapAnalysis = await GapAnalysisModel.findById(params.id)
    if (!gapAnalysis) {
      throw new Error('Error gapAnalysis not found')
    }
    const gapAnalysisData = Object.assign({}, params.data)
    const existingFileId = getKeyConsiderationFile(gapAnalysis, gapAnalysisData)

    // If the file is different remove previous relation between file and key consideration
    if (existingFileId && !existingFileId.equals(gapAnalysisData.file)) {
      await GapFileModel.updateOne(
        { _id: existingFileId },
        {
          $pull: {
            keyConsiderations: gapAnalysisData.keyConsideration,
            criteria: { name: gapAnalysisData.keyConsideration },
          }
        }
      )
    }

    const coreSubjects = updateCoreSubjects(gapAnalysis, gapAnalysisData)

    const { item } = await updateItem({
      id: params.id,
      type: 'gapAnalysis',
      changes: {
        coreSubjects: coreSubjects,
      },
      projection,
      userId: root.user._id,
    })

    if (gapAnalysisData.file) {
      await GapFileModel.updateOne(
        { _id: gapAnalysisData.file },
        { $addToSet: { keyConsiderations: gapAnalysisData.keyConsideration }, assessmentComplete: false }
      )
    }

    return item
  },
}


module.exports = {
  updateGapAnalysis,
  updateGapAnalysisFile,
}
