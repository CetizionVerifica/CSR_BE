const {round, sumBy, meanBy} = require('lodash')
const getProjection = require('../../../helpers/getProjection')
const {
  GraphQLNonNull,
  GraphQLID,
  GraphQLString,
  GraphQLBoolean,
  GraphQLList,
} = require('graphql')

const GapAnalysisModel = require('../../../models/gapAnalysis')
const GapFileModel = require('../../../models/gapFile')
const ProjectModel = require('../../../models/project')
const CompanyModel = require('../../../models/company')
const ProjectType = require('../../types/projectType')
const RevisingScoreType = require('../../types/revisingScoreType')
const ProjectInputType = require('../../types/projectInputType')
const updateItem = require('../_helper/updateItem')
const {
  updateKeyConsiderationRevisingScore,
} = require('../gapAnalysis/_helper')
const mongoose = require('mongoose')
const {checkAuth} = require('../../../services/checkAuth')

const updateProject = {
  type: ProjectType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    data: {
      name: 'data',
      type: new GraphQLNonNull(ProjectInputType),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    // console.log(params)
    const {item} = await updateItem({
      id: params.id,
      type: 'project',
      changes: {...params.data},
      projection,
      userId: root.user._id,
    })
    return item
  },
}
const updateProjectTitle = {
  type: ProjectType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    title: {
      name: 'title',
      type: new GraphQLNonNull(GraphQLString),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const {item} = await updateItem({
      id: params.id,
      type: 'project',
      changes: {title: params.title},
      projection,
      userId: root.user._id,
    })
    return item
  },
}

const activeProject = {
  type: ProjectType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    active: {
      name: 'active',
      type: new GraphQLNonNull(GraphQLBoolean),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const {item} = await updateItem({
      id: params.id,
      type: 'project',
      changes: {active: params.active},
      projection,
      userId: root.user._id,
    })
    return item
  },
}

const archiveProject = {
  type: ProjectType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    archive: {
      name: 'archive',
      type: new GraphQLNonNull(GraphQLBoolean),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const {item} = await updateItem({
      id: params.id,
      type: 'project',
      changes: {archive: params.archive},
      projection,
      userId: root.user._id,
    })
    return item
  },
}

const changeProjectStatus = {
  type: ProjectType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    status: {
      name: 'status',
      type: new GraphQLNonNull(GraphQLString),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const {item} = await updateItem({
      id: params.id,
      type: 'project',
      changes: {status: params.status},
      projection,
      userId: root.user._id,
    })
    return item
  },
}

const submitProjectAssessmentStatus = {
  type: ProjectType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    status: {
      name: 'status',
      type: new GraphQLNonNull(GraphQLString),
    },
    revisingScores: {
      name: 'revisingScores',
      type: new GraphQLList(RevisingScoreType),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    if (root.user.role !== 'Admin') {
      return null
    }

    await GapFileModel.updateMany({
      'project': params.id,
      'keyConsiderations.0': {$exists: true}},
    {assessmentComplete: true})

    const gapAnalysis = await GapAnalysisModel.findOne({project: params.id})

    const coreSubjects = updateKeyConsiderationRevisingScore(gapAnalysis, params.revisingScores)
    const companyOverAllPerformance = round(sumBy(coreSubjects, 'WeightValue') * 100, 1)
    const companyOverAllRelevance = round(meanBy(coreSubjects, 'relevanceValue') * 100, 1)
    const companyOverAllrevisedWeightValue = round(sumBy(coreSubjects, 'revisedWeightValue') * 100, 1)

    await updateItem({
      id: gapAnalysis.id,
      type: 'gapAnalysis',
      changes: {
        coreSubjects: coreSubjects,
        weightedPerformance: companyOverAllPerformance || 0,
        revisedWeightValue : companyOverAllrevisedWeightValue ||0 ,
        relevance: companyOverAllRelevance || 0,
      },
      projection: '',
      userId: root.user._id,
    })

    const updateData = {status: params.status}

    if (params.status === 'FirstAssessmentCompleted') {
      updateData.firstAssessmentDate = new Date()
    }

    if (params.status === 'Completed') {
      updateData.secondAssessmentDate = new Date()
    }

    const projection = getProjection(options.fieldNodes[0])
    const {item} = await updateItem({
      id: params.id,
      type: 'project',
      changes: updateData,
      projection,
      userId: root.user._id,
    })
    return item
  },
}

const changeSupplierFullAccess = {
  type: ProjectType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    company: {
      name: 'company',
      type: new GraphQLNonNull(GraphQLID),
    },
    agency: {
      name: 'agency',
      type: new GraphQLNonNull(GraphQLID),
    },
    fullAccessToResults: {
      name: 'fullAccessToResults',
      type: new GraphQLNonNull(GraphQLBoolean),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const companyId = mongoose.Types.ObjectId(params.company)
    const agencyId = mongoose.Types.ObjectId(params.agency)
    const supplier = await CompanyModel.aggregate([
      {
        $match: {
          _id: companyId,
        },
      }, {
        $unwind: {
          path: '$suppliers',
        },
      }, {
        $match: {
          'suppliers.agency': agencyId,
        },
      }, {
        $project: {
          supplierId: '$suppliers._id',
        },
      },
    ])

    if (supplier.length === 0 || !supplier[0].supplierId) {
      throw new Error('Error supplier not found')
    }

    const supplierId = supplier[0].supplierId

    const result = await ProjectModel.updateOne(
      {'_id': params.id, 'supplierProperties.supplier': supplierId},
      {$set: {'supplierProperties.$.fullAccessToResults': params.fullAccessToResults}}
    )

    if (!result.nModified) {
      const newFlagging = {supplier: supplierId, fullAccessToResults: params.fullAccessToResults}
      await ProjectModel.updateOne({
        _id: params.id,
      },
      {
        $push: {supplierProperties: newFlagging},
      })
    }

    const projection = getProjection(options.fieldNodes[0])

    const item = await ProjectModel.findById(params.id).select(projection)

    return item
  },
}

const changeSupplierPhysicalAudit = {
  type: ProjectType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    supplier: {
      name: 'supplier',
      type: new GraphQLNonNull(GraphQLString),
    },
    physicalAudit: {
      name: 'physicalAudit',
      type: GraphQLBoolean,
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const result = await ProjectModel.updateOne(
      {'_id': params.id, 'supplierProperties.supplier': params.supplier},
      {$set: {'supplierProperties.$.physicalAudit': params.physicalAudit}}
    )

    if (!result.nModified) {
      const newPhysicalAudit = {supplier: params.supplier, physicalAudit: params.physicalAudit}
      await ProjectModel.updateOne({
        _id: params.id,
      },
      {
        $push: {supplierProperties: newPhysicalAudit},
      })
    }

    const projection = getProjection(options.fieldNodes[0])

    const item = await ProjectModel.findById(params.id).select(projection)

    return item
  },
}

module.exports = {
  updateProject,
  updateProjectTitle,
  activeProject,
  archiveProject,
  changeProjectStatus,
  submitProjectAssessmentStatus,
  changeSupplierFullAccess,
  changeSupplierPhysicalAudit,
}
