const mongoose = require('mongoose')
const Schema = mongoose.Schema

const QuestionSchema = new Schema({
  id: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  position: {type: Number},
  options: [{id: {type: String}, text: {type: String}}],
  values: [{id: {type: String}, value: {type: Number}}],
  resultsType: {
    type: String,
  },
})

const SurveySchema = new Schema({
  surveyId: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  createdDate: {
    type: Date,
    default: Date.now,
  },
  modifiedDate: {
    type: Date,
    default: Date.now,
  },
  flag: {
    type: String,
    enum: ['internal', 'external'],
  },
  previewLink: {
    type: String,
    required: true,
  },
  editUrl: {
    type: String,
    required: true,
  },
  questions: [QuestionSchema],
})

const ModelClass = mongoose.model('survey', SurveySchema)

module.exports = ModelClass
