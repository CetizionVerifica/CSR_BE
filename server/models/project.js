const mongoose = require('mongoose')
const {find} = require('lodash')
const Schema = mongoose.Schema
const AgencyModel = require('./agency')

const scorPersent = [0, 25, 50, 75, 100]


const SupplierPropertiesSchema = new Schema({
  supplier: {
    type: String,
  },
  fullAccessToResults: {
    type: Boolean,
  },
  physicalAudit: {
    type: Boolean,
  },
})

const ProjectSchema = new Schema({
  agency: {
    type: Schema.Types.ObjectId,
    ref: 'agency',
  },
  company: {
    type: Schema.Types.ObjectId,
    ref: 'company',
  },
  title: {
    type: String,
    required: true,
  },
  year: {
    type: Number,
    required: true,
  },
  numberOfEmployees: {
    type: Number,
    default: 0,
  },
  gapAnalysis: {
    type: Schema.Types.ObjectId,
    ref: 'gapAnalysis',
  },
  status: {
    type: String,
    enum: ['New', 'FirstAssessmentRequest', 'FirstAssessmentCompleted', 'SecondAssessmentRequest', 'Completed' ,'MaterialitySendSurvey','MaterialityCompleted' ,'Finished'],
    default: 'New',
  },
  materiality: {
    type: Schema.Types.ObjectId,
    ref: 'materiality',
  },
  users: [{
    type: Schema.Types.ObjectId,
    ref: 'user',
  }],
  supplierProperties: [SupplierPropertiesSchema],
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'user',
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'user',
  },
  active: {
    type: Boolean,
    default: true,
  },
  archive: {
    type: Boolean,
    default: false,
  },
  firstAssessmentDate: {
    type: Date,
    default: null,
  },
  secondAssessmentDate: {
    type: Date,
    default: null,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  endDate: {
    type: Date,
  },
  updatedDate: {
    type: Date,
    default: Date.now,
  },
})

ProjectSchema.statics.keyConsideration = function(id, data) {
  const Project = mongoose.model('project')

  return Project.findById(id)
    .then(project => {
      //console.log(project)
      const gapAnalysis = find(project.gapAnalysis, ['keyConsideration', data.keyConsideration])
      if (gapAnalysis) {
        if (data.companyPerformanceValue !== undefined) {
          gapAnalysis.companyPerformanceValue = data.companyPerformanceValue
        }
        if (data.companyPerformanceValue === 0) {
          gapAnalysis.relevanceSignificanceValue = 0
        }
        if (data.relevanceSignificanceValue !== undefined) {
          gapAnalysis.relevanceSignificanceValue = data.relevanceSignificanceValue
        }
        if (data.note) {
          gapAnalysis.note = data.note
        }

        const score = gapAnalysis.relevanceSignificanceValue - gapAnalysis.companyPerformanceValue
        if (score < 0) {
          gapAnalysis.score = 0
        } else {
          gapAnalysis.score = scorPersent[score]
        }


      } else {
        project.gapAnalysis.push(data)
      }
      return project.save()
    })
}

ProjectSchema.statics.addMateriality = function(projectid, stackholderId, materialityRecord) {
  const Materiality = mongoose.model('materiality')
  const Stackholder = mongoose.model('stackholder')
  return this.findById(projectid)
    .then(project => {
      return Stackholder.findById(stackholderId)
        .then(stackholder => {
          const materiality = new Materiality({...materialityRecord, project, stackholder})
          project.materiality.push(materiality)
          stackholder.materiality.push(materiality)
          return Promise.all([materiality.save(), stackholder.save(), project.save()])
            .then(([materiality, stackholder, project]) => project)
        })

    })
}

ProjectSchema.statics.addMaterialityCompany = function(projectid) {
  const Materiality = mongoose.model('materiality')
  return this.findById(projectid)
    .then(project => {
      const stackholder = project.company
      const materiality = new Materiality({weight: 100, project, stackholder})
      project.materiality.push(materiality)
      return Promise.all([materiality.save(), project.save()])
        .then(([materiality, project]) => project)
    })


}
ProjectSchema.statics.findGapAnalysis = function(id) {
  return this.findById(id)
    .populate('gapAnalysis')
    .then(project => project.gapAnalysis)
}

ProjectSchema.statics.findMateriality = function(id) {
  return this.findById(id)
    .populate('materiality')
    .then(project => project.materiality)
}

ProjectSchema.pre('remove', async function(next) {
  await AgencyModel
    .findByIdAndUpdate(this.agency, {$pull: {projects: this._id}})
})

const ModelClass = mongoose.model('project', ProjectSchema)

module.exports = ModelClass
