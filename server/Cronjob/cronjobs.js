const mongoose = require('mongoose')
const ObjectId = mongoose.Types.ObjectId
const Survey = require('../controllers/survey')
const Agency = require('../models/agency')
const Company = require('../models/company')
const ProjectSurvey = require('../models/projectSurvey')
const ProjectModel = require('../models/project')
const SurveyMonkey = require('../services/surveyMonkey')
const { updateStakeholderResults, updateEmployeeResults } = require('../services/materiality')
const logger = require('../logger')
const { findOne } = require('../models/survey')
const config = require('../../server/config/keys')
loadall();


async function loadall(){
console.log('ggg')

mongoose.Promise = global.Promise
const mongooseOptions = {
  useMongoClient: true,
  // autoIndex: false, // Don't build indexes
  // reconnectTries: Number.MAX_VALUE, // Never stop trying to reconnect
  // reconnectInterval: 500, // Reconnect every 500ms
  // poolSize: 10, // Maintain up to 10 socket connections
  // // If not connected, return errors immediately rather than waiting for reconnect
  // bufferMaxEntries: 0
}
//DB Setup
mongoose.connect(config.mongoURI, mongooseOptions, (err) => {
  if (err) {
    logger.debug('DB: Not Connected')
  } else {
    logger.debug('DB: Connected')
  }
})

    const checkclosed = await ProjectSurvey.find(  { 'internal.recipients' : { $elemMatch: { 'recipientId' : null } } } )   

    console.log(checkclosed);



    const Surveym = new Survey();


    Surveymod.clos

}