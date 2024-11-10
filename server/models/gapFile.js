const mongoose = require('mongoose')
const Schema = mongoose.Schema

const criteriaSchema = new Schema({
  name: {type: String, required: true},
  value: {type: Number},
})

const GapFileSchema = new Schema({
  project: {
    type: Schema.Types.ObjectId,
    ref: 'project',
  },
  path: {
    type: String,
  },
  name: {
    type: String,
  },
  keyConsiderations: {
    type: [String],
    default: [],
  },
  uploadedBy: {
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
  assessmentComplete: {
    type: Boolean,
  },
  criteria: {
    type: [criteriaSchema],
    default: [],
  },
})

const ModelClass = mongoose.model('gapFile', GapFileSchema)

module.exports = ModelClass
