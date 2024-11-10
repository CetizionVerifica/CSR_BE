const mongoose = require('mongoose')
const Schema = mongoose.Schema
const CompanyModel = require('./company')

const ProjectPerformanceSchema = new Schema({
  project: {
    type: Schema.Types.ObjectId,
    ref: 'project',
  },
  year: {type: Number},
  performance: {type: Number},
  targetPerformance: {type: Number},
  isBaseline: {type: Boolean, default: false},
  note: {type: String},
})
const ActionAndKPIsSchema = new Schema({
  company: {
    type: Schema.Types.ObjectId,
    ref: 'company',
  },
  project: {
    type: Schema.Types.ObjectId,
    ref: 'project',
  },
  year: {type: Number},
  projectPerformance: [ProjectPerformanceSchema],
  coreSubject: {
    type: String,
    required: true,
  },
  issueOfInterest: {
    type: String,
    required: true,
  },
  action: {
    type: String,
    required: true,
  },
  kpi: {
    type: String,
    required: true,
  },
  baselinePerformance: {
    type: Number,
    required: true,
  },
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

ActionAndKPIsSchema.pre('remove', async function(next) {
  await CompanyModel
    .findByIdAndUpdate(this.company, {$pull: {actionAndKPIs: this._id}})
})

const ModelClass = mongoose.model('actionAndKPIs', ActionAndKPIsSchema)

module.exports = ModelClass
