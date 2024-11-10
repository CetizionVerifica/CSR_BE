const mongoose = require('mongoose')
const Schema = mongoose.Schema
const ObjectId = mongoose.Types.ObjectId
const CompanyModel = require('./company')
const StakeholderSchema = new Schema({
  company: {
    type: Schema.Types.ObjectId,
    ref: 'company',
  },
  isCompany: {
    type: Boolean,
    default: false,
  },
  name: {
    type: String,
    required: true,
  },
  companyName: {
    type: String,
    required: true,
  },
  jobPosition: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
  },
  extention: {
    type: String,
  },
  fax: {
    type: String,
  },
  materiality: [{
    type: Schema.Types.ObjectId,
    ref: 'materiality',
  }],
  active: {
    type: Boolean,
    default: true,
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

StakeholderSchema.pre('remove', async function(next) {
  await CompanyModel
    .findByIdAndUpdate(this.company, {$pull: {stakeholders: this._id}})
})


StakeholderSchema.statics.findByCompany = function(companyId) {
  return this.find({company: new ObjectId(companyId), active: true}).exec()
}

StakeholderSchema.statics.findMateriality = function(id) {
  return this.findById(id)
    .populate('materiality')
    .then(stakeholder => stakeholder.materiality)
}

const ModelClass = mongoose.model('stakeholder', StakeholderSchema)

module.exports = ModelClass
