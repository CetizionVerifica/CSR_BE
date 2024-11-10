const mongoose = require('mongoose')
const Schema = mongoose.Schema

const RecipientSchema = new Schema({
  stakeholder: {
    type: Schema.Types.ObjectId,
    ref: 'stakeholder',
  },
  employee: {
    type: Schema.Types.ObjectId,
    ref: 'employee',
  },
  recipientId: {
    type: String,
  },
  email: {
    type: String,
  },
  name: {
    type: String,
  },
  company: {
    type: String,
  },
  jobPosition: {
    type: String,
  },
  phone: {
    type: String,
  },
  responseDate: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    enum: ['not_responded', 'partially_responded', 'completely_responded'],
    default: 'not_responded',
  },
})

const SendSurveySchema = new Schema({
  // survey: {
  //   type: Schema.Types.ObjectId,
  //   ref: 'survey',
  // },
  collectorId: {
    type: String,
    required: true,
  },
  messageId: {
    type: String,
    required: true,
  },
  reminderMessageId: {
    type: String,
  },
  recipients: [RecipientSchema],
})

const ProjectSurveySchema = new Schema({
  agency: {
    type: Schema.Types.ObjectId,
    ref: 'agency',
  },
  project: {
    type: Schema.Types.ObjectId,
    ref: 'project',
  },
  collectors: [{type: String}],
  surveys: [{
    type: Schema.Types.ObjectId,
    ref: 'survey',
  }],
  sendDate: {
    type: Date,
    default: Date.now,
  },
  reminderSendDate: {
    type: Date,
    default: null,
  },
  closeDate: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    enum: ['open', 'closed'],
    default: 'open',
    required: true,
  },
  internal: {
    type: SendSurveySchema,
  },
  external: {
    type: SendSurveySchema,
  },
})

const ModelClass = mongoose.model('projectSurvey', ProjectSurveySchema)

module.exports = ModelClass
