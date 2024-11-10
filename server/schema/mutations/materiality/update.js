const {findIndex} = require('lodash')
const getProjection = require('../../../helpers/getProjection')
const {
  GraphQLNonNull,
  GraphQLID,
  GraphQLInt,
  GraphQLList,
  GraphQLString,
} = require('graphql')
const MaterialityType = require('../../types/materialityType')
const {
  MCoreSubjectInputType,
  MIssueOfInterestInputType,
} = require('../../types/materialityElementInputType')
const MaterialityModel = require('../../../models/materiality')
const StakeholderModel = require('../../../models/stakeholder')
const updateItem = require('../_helper/updateItem')
const {
  updateCoreSubjectsStakeholders,
  updateStakeholderCoreSubjectsRating,
  updateStakeholderIssueOfInertestRating,
  updateCoreSubjectsMateriality,
  updateStakeholdersGroup} = require('./_helper')
const {checkAuth} = require('../../../services/checkAuth')

const stakeholderCoreSubjectsRating = {
  type: MaterialityType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    stakeholderId: {
      name: 'stakeholderId',
      type: new GraphQLNonNull(GraphQLID),
    },
    data: {
      name: 'data',
      type: new GraphQLNonNull(GraphQLList(MCoreSubjectInputType)),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const materiality = await MaterialityModel.findById(params.id)
    if (!materiality) {
      throw new Error('Error cant find materiality')
    }

    const indexStakeholder =
    findIndex(materiality.stakeholders,
      s => s.stakeholder.toString() === params.stakeholderId)
    materiality.stakeholders[indexStakeholder] =
    updateStakeholderCoreSubjectsRating(materiality.stakeholders[indexStakeholder], params.data)
    const coreSubjects = updateCoreSubjectsStakeholders(materiality, params.data)
    const {item} = await updateItem({
      id: params.id,
      type: 'materiality',
      changes: {
        stakeholders: [...materiality.stakeholders],
        coreSubjects: coreSubjects,
      },
      projection,
      userId: root.user._id,
    })
    return item
  },
}

const stakeholderIssueOfInterestRating = {
  type: MaterialityType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    stakeholderId: {
      name: 'stakeholderId',
      type: new GraphQLNonNull(GraphQLID),
    },
    coreSubject: {
      name: 'coreSubject',
      type: new GraphQLNonNull(GraphQLString),
    },
    data: {
      name: 'data',
      type: new GraphQLNonNull(GraphQLList(MIssueOfInterestInputType)),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const materiality = await MaterialityModel.findById(params.id)
    if (!materiality) {
      throw new Error('Error cant find materiality')
    }

    const indexStakeholder =
    findIndex(materiality.stakeholders,
      s => s.stakeholder.toString() === params.stakeholderId)
    materiality.stakeholders[indexStakeholder] =
    updateStakeholderIssueOfInertestRating(
      materiality.stakeholders[indexStakeholder],
      params.coreSubject,
      params.data)
    const coreSubjects = updateCoreSubjectsMateriality(materiality, params.coreSubject, params.data)
    const {item} = await updateItem({
      id: params.id,
      type: 'materiality',
      changes: {
        stakeholders: [...materiality.stakeholders],
        coreSubjects: coreSubjects,
      },
      projection,
      userId: root.user._id,
    })
    return item
  },
}

const updateStakeholderGroup = {
  type: MaterialityType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    stakeholderId: {
      name: 'stakeholderId',
      type: new GraphQLNonNull(GraphQLID),
    },
    groupXFactor: {
      name: 'groupXFactor',
      type: new GraphQLNonNull(GraphQLInt),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const materiality = await MaterialityModel.findById(params.id)
    if (!materiality) {
      throw new Error('Error cant find materiality')
    }

    const stakeholder = await StakeholderModel.findById(params.stakeholderId)
    if (!stakeholder) {
      throw new Error('Error cant find stakeholder')
    }

    const updateMateriality = await MaterialityModel
      .findOneAndUpdate({'_id': params.id, 'stakeholders.stakeholder': params.stakeholderId},
        {$set: {'stakeholders.$.groupXFactor': params.groupXFactor}}, {new: true})
      .select(projection).exec()

    const stakeholders =
       updateStakeholdersGroup(updateMateriality, materiality, params.stakeholderId, params.groupXFactor)
    materiality.coreSubjects = updateCoreSubjectsStakeholders(materiality, materiality.coreSubjects)
    const {item} = await updateItem({
      id: params.id,
      type: 'materiality',
      changes: {
        stakeholders: stakeholders,
        coreSubjects: [...materiality.coreSubjects],
      },
      projection,
      userId: root.user._id,
    })
    return item
  },
}

module.exports = {
  updateStakeholderGroup,
  stakeholderCoreSubjectsRating,
  stakeholderIssueOfInterestRating,
}

