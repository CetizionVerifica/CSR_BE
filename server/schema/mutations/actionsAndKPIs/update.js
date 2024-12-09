const {find} = require('lodash')
const mongoose = require('mongoose')
const getProjection = require('../../../helpers/getProjection')
const {
  GraphQLNonNull,
  GraphQLID,
} = require('graphql')
const ActionsAndKPIsModel = require('../../../models/actionsAndKPIs')
const ProjectModel = require('../../../models/project')
const ActionsAndKPIsInputType = require('../../types/actionsAndKPIsInputType')
const ActionsAndKPIsType = require('../../types/actionsAndKPIsType')
const ProjectActionsAndKPIsInputType = require('../../types/projectActionsAndKPIsInputType')
const updateItem = require('../_helper/updateItem')
const {checkAuth} = require('../../../services/checkAuth')
const ObjectId = mongoose.Types.ObjectId


const updateProject = async(actionsAndKPI, data) => {
  //if()
  const myObjectId = new mongoose.Types.ObjectId(data.project)
  const record = find(actionsAndKPI.projectPerformance, {project: myObjectId})
  if (record) {
    record.performance = data.performance
    record.targetPerformance = data.targetPerformance
    record.year = data.year
    return actionsAndKPI.projectPerformance
  } else {
    const project = await ProjectModel.findById(data.project)
    if (!project) {
      throw new Error('Error project not found')
    }
    const projectPerformance = {
      project: project,
      performance: data.performance,
      targetPerformance: data.targetPerformance,
      year: data.year,
    }
    return [...actionsAndKPI.projectPerformance, projectPerformance]
  }
}


const updateActionsAndKPIs = {
  type: ActionsAndKPIsType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    data: {
      name: 'data',
      type: new GraphQLNonNull(ActionsAndKPIsInputType),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])
    const {item} = await updateItem({
      id: params.id,
      type: 'actionsAndKPIs',
      changes: {...params.data},
      projection,
      userId: root.user._id,
    })
    return item
  },
}

// const updateProjectActionsAndKPIs = {
//   type: ActionsAndKPIsType,
//   args: {
//     id: {
//       name: 'id',
//       type: new GraphQLNonNull(GraphQLID),
//     },
//     data: {
//       name: 'data',
//       type: new GraphQLNonNull(ProjectActionsAndKPIsInputType),
//     },
//   },
//   async resolve(root, params, context, options) {
//     checkAuth(context.isAuthenticated())

//     const projection = getProjection(options.fieldNodes[0])

//     const actionsAndKPI = await ActionsAndKPIsModel.findById(params.id)
//     if (!actionsAndKPI) {
//       throw new Error('Error action and KPI not found')
//     }
//     const actionsAndKPIData = Object.assign({}, params.data)
//     const projects = await updateProject(actionsAndKPI, actionsAndKPIData)
//     const {item} = await updateItem({
//       id: params.id,
//       type: 'actionsAndKPIs',
//       changes: {projectPerformance: projects},
//       projection,
//       userId: root.user._id,
//     })
//     return item
//   },
// }

const updateProjectActionsAndKPIs = {
  type: ActionsAndKPIsType,
  args: {
    id: {
      name: 'id',
      type: new GraphQLNonNull(GraphQLID),
    },
    data: {
      name: 'data',
      type: new GraphQLNonNull(ProjectActionsAndKPIsInputType),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated());

    const projection = getProjection(options.fieldNodes[0]);

    // Ensure `params.id` is an ObjectId
    const objectId = new ObjectId(params.id); // Fixes `Class constructor ObjectId` issue

    console.log(objectId, 'objectId===============================>');
    const actionsAndKPI = await ActionsAndKPIsModel.findById(objectId);
    if (!actionsAndKPI) {
      throw new Error('Error action and KPI not found');
    }

    const actionsAndKPIData = { ...params.data };
    const projects = await updateProject(actionsAndKPI, actionsAndKPIData);
    
    const { item } = await updateItem({
      id: objectId,
      type: 'actionsAndKPIs',
      changes: { projectPerformance: projects },
      projection,
      userId: root.user._id,
    });
    return item;
  },
};



module.exports = {
  updateActionsAndKPIs,
  updateProjectActionsAndKPIs,
}
