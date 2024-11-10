const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const QuestionSchema = new Schema({
  answerIsRequired: {
    type: Boolean,
    default: true,
  },  
  updatedOnce: {
    type: Boolean,
    default: false,
  },
  translation_id: {
    type: String,
    default: '',
  }, 
  id_in_template: {
    type: String,
    // required: true,
  }, 
  question: {
    type: String,
    required: true,
  },
  max_selections: {
    type: Number,
    required: false,
  },
  type: {
    type: String,
    enum: ['order', 'radio', 'checkbox', 'free_text'],
    required: true,
  },
  answers: [
    {
      id_in_template: {type: String},
      category: {type: String},
      text: {type: String},
      input: {type: String},
      translation_id: {type: String, default: ''},       
      selected: {type: Boolean}
    }
  ],  
});

const QuestionnaireSchema = new Schema({
  questions: [QuestionSchema],
  id_in_template: {
    type: String,
    // required: true,
  },
  translation_id: {
    type: String,
    default: '',
  }, 
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
});

const SurveySchema = new Schema({
  stakeholderID: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  projectSurveyID: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  sideID: {
    type: Schema.Types.ObjectId,
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
  type: {
    type: String,
    enum: ['internal', 'external'],
  },
  completed:{
    type: Boolean,
    required: false,
    default: false,
  },
  questionnaire: QuestionnaireSchema,
})

const ModelClass = mongoose.model('new_survey', SurveySchema)

module.exports = ModelClass
