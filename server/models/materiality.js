const mongoose = require('mongoose')
const Schema = mongoose.Schema
const ProjectModel = require('./project')

const MaterialityIssueOfInterestSchema = new Schema({
  issueOfInterest: {
    type: String,
    required: true,
  },
  relevanceCompanyValue: {type: Number, default: 0},
  relevanceStakeholdersValue: {type: Number, default: 0},
  relevanceEmployeesValue: {type: Number, default: 0},
  weightValue: {type: Number, default: 0},
})

const MaterialityCoreSubjectSchema = new Schema({
  coreSubject: {
    type: String,
    required: true,
  },
  issueOfInterests: [MaterialityIssueOfInterestSchema],
  relevanceCompanyValue: {type: Number, default: 0},
  relevanceStakeholdersValue: {type: Number, default: 0},
  relevanceEmployeesValue: {type: Number, default: 0},
  weightValue: {type: Number, default: 0},
})

const StakeholderIssueOfInterestSchema = new Schema({
  issueOfInterest: {
    type: String,
    required: true,
  },
  rating: {type: Number, default: 0},
  relevanceValue: {type: Number, default: 0},
  relevanceWeightValue: {type: Number, default: 0},
})

const StakeholderCoreSubjectSchema = new Schema({
  coreSubject: {
    type: String,
    required: true,
  },
  rating: {type: Number, default: 0},
  relevanceValue: {type: Number, default: 0},
  relevanceWeightValue: {type: Number, default: 0},
  issueOfInterests: [StakeholderIssueOfInterestSchema],
})


const StakeholderSchema = new Schema({
  stakeholder: {
    type: Schema.Types.ObjectId,
    ref: 'stakeholder',
  },
  groupXFactor: {type: Number, default: 0},
  credits: {type: Number, default: 0},
  weightValue: {type: Number, default: 0},
  isCompany: {type: Boolean, default: false},
  coreSubjects: [StakeholderCoreSubjectSchema],

})

const EmployeeSchema = new Schema({
  employee: {
    type: Schema.Types.ObjectId,
    ref: 'employee',
  },
  groupXFactor: {type: Number, default: 0},
  credits: {type: Number, default: 0},
  weightValue: {type: Number, default: 0},
  isCompany: {type: Boolean, default: false},
  coreSubjects: [StakeholderCoreSubjectSchema],

})


const MaterialitySchema = new Schema({
  project: {
    type: Schema.Types.ObjectId,
    ref: 'project',
  },
  stakeholders:[StakeholderSchema],
  employees: [EmployeeSchema],
  test: [String],
  coreSubjects: [MaterialityCoreSubjectSchema],
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

MaterialitySchema.pre('remove', async function(next) {
  await ProjectModel
    .findByIdAndUpdate(this.project, {$pull: {materiality: this._id}})
})

const ModelClass = mongoose.model('materiality', MaterialitySchema)

module.exports = ModelClass
