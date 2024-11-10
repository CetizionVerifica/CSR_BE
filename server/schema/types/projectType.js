const mongoose = require('mongoose')
const graphql = require('graphql')
const GapAnalysisType = require('./gapAnalysisType')
const MaterialityType = require('./materialityType')
const UserType = require('./userType')
const GapFileType = require('./gapFileType')
const SupplierPropertiesType = require('./supplierPropertiesType')
const UserModel = require('../../models/user')
const GapFileModel = require('../../models/gapFile')
const AgencyModel = require('../../models/agency')
const {
  GraphQLObjectType,
  GraphQLID,
  GraphQLFloat,
  GraphQLString,
  GraphQLInt,
  GraphQLBoolean,
  GraphQLList,
} = graphql
const Project = mongoose.model('project')

const ProjectType = new GraphQLObjectType({
  name: 'ProjectType',
  fields: () => ({
    id: {type: GraphQLID},
    title: {type: GraphQLString},
    year: {type: GraphQLInt},
    numberOfEmployees: {type: GraphQLInt},
    active: {type: GraphQLBoolean},
    arctive: {type: GraphQLBoolean},
    status: {type: GraphQLString},
    agency: {
      type: require('./agencyType'),
      async resolve(project) {
        return await AgencyModel.findById(project.agency).exec()
      },
    },
    gapAnalysis: {
      type: GapAnalysisType,
      resolve(parentValue) {
        return Project.findGapAnalysis(parentValue.id)
      },
    },
    supplierProperties: {
      type: GraphQLList(SupplierPropertiesType),
      async resolve(parentValue) {
        return parentValue.supplierProperties
      },
    },
    gapFiles: {
      type: GraphQLList(GapFileType),
      async resolve(parentValue) {
        return await GapFileModel.find({project: parentValue.id})
      },
    },
    materiality: {
      type: MaterialityType,
      resolve(parentValue) {
        return Project.findMateriality(parentValue.id)
      },
    },
    company: {
      type: require('./companyType'),
      resolve(parentValue) {
        return Project.findById(parentValue).populate('company')
          .then(project => {
            return project.company
          })
      },
    },
    updatedBy: {
      type: UserType,
      async resolve(company) {
        return await UserModel.findById(company.updatedBy).exec()
      },
    },
    createdBy: {
      type: UserType,
      async resolve(company) {
        return await UserModel.findById(company.createdBy).exec()
      },
    },
    date: {
      type: GraphQLFloat,
      resolve({date}) {
        return date && date.getTime()
      },
    },
    endDate: {
      type: GraphQLFloat,
      resolve({endDate}) {
        return endDate && endDate.getTime()
      },
    },
    updatedDate: {
      type: GraphQLFloat,
      resolve({updatedDate}) {
        return updatedDate && updatedDate.getTime()
      },
    },
  }),
})

module.exports = ProjectType
