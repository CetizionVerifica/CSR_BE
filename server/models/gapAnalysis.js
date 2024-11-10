const mongoose = require('mongoose')
const Schema = mongoose.Schema
const ProjectModel = require('./project')

const keyConsiderationSchema = new Schema({
  keyConsideration: {type: String, required: true},
  performanceValue: {type: Number},
  actualPerformanceValue: {type: Number},
  relevanceValue: {type: Number},
  relevanceWeightValue: {type: Number},
  revisedWeightValue : {type: Number, default: 0},
  revisedPerformanceValue: {type: Number, default: 0},

  WeightValue: {type: Number},
  performanceVsRelevanceScore: {type: Number},
  issueLevel: {type: Number},
  note: {type: String},
  revisingScore: {type: Number},
  revisedScore: {type: Number},
  file: {
    type: Schema.Types.ObjectId,
    ref: 'gapFile',
  },
  noDocument: {type: Boolean, default: false},
  noRelatedDocument: {type: Boolean, default: false},
})

const IssueOfInterestSchema = new Schema({
  issueOfInterest: {
    type: String,
    required: true,
  },
  keyConsiderations: [keyConsiderationSchema],
  performanceValue: {type: Number, default: 0},
  relevanceValue: {type: Number, default: 0},
  relevanceWeightValue: {type: Number, default: 0},
  revisedWeightValue : {type: Number, default: 0},
  revisedScore   : {type: Number, default: 0},
  WeightValue: {type: Number, default: 0},
  customField: {type: Object, default: []},
  extraCustomField: {type: Object, default: []}
})

const CoreSubjectSchema = new Schema({
  coreSubject: {
    type: String,
    required: true,
  },
  issueOfInterests: [IssueOfInterestSchema],
  performanceValue: {type: Number, default: 0},
  relevanceValue: {type: Number, default: 0},
  relevanceWeightValue: {type: Number, default: 0},
  revisedWeightValue : {type: Number, default: 0},
  revisedScore   : {type: Number, default: 0},

  WeightValue: {type: Number, default: 0},
  totalKeyConsiderations: {type: Number, default: 0},
})

const GapAnalysisSchema = new Schema({
  project: {
    type: Schema.Types.ObjectId,
    ref: 'project',
  },
  weightedPerformance: {
    type: Number,
  },
  revisedWeightValue: {
    type: Number,
  },
  relevance: {
    type: Number,
  },
  coreSubjects: [CoreSubjectSchema],
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'user',
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'user',
  },
  date: {
    type: Date,
    default: Date.now,
  },
  updatedDate: {
    type: Date,
    default: Date.now,
  },
})

GapAnalysisSchema.pre('remove', async function(next) {
  await ProjectModel
    .findByIdAndUpdate(this.project, {$pull: {gapAnalysis: this._id}})
})

const ModelClass = mongoose.model('gapAnalysis', GapAnalysisSchema)

module.exports = ModelClass
