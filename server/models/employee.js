const mongoose = require('mongoose')
const Schema = mongoose.Schema
const ObjectId = mongoose.Types.ObjectId
const CompanyModel = require('./company')
const EmployeeSchema = new Schema({
  company: {
    type: Schema.Types.ObjectId,
    ref: 'company',
  },
  name: {
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

EmployeeSchema.statics.findByCompany = function(companyId) {
  return this.find({company: new ObjectId(companyId), active: true}).exec()
}

EmployeeSchema.pre('remove', async function(next) {
  await CompanyModel
    .findByIdAndUpdate(this.company, {$pull: {employees: this._id}})
})

const ModelClass = mongoose.model('employee', EmployeeSchema)

module.exports = ModelClass
