const { find, get, result } = require('lodash')
const mongoose = require('mongoose')
const ObjectId = mongoose.Types.ObjectId
const Survey = require('../models/survey')
const Agency = require('../models/agency')
const Company = require('../models/company')
const ProjectSurvey = require('../models/projectSurvey')
const ProjectModel = require('../models/project')
const SurveyMonkey = require('../services/surveyMonkey')
const { updateStakeholderResults, updateEmployeeResults } = require('../services/materiality')
const logger = require('../logger')
const { findOne, findById } = require('../models/survey')
const nodeMaler = require('../services/nodeMaler');
const SSurvey = require('../models/newsurvey');
const { Response } = require('../helpers/response');
const applicationUrl = require('../config/keys').applicationUrl;
const { internalTemplate, questionTypes, externalTemplate } = require('../helpers/survey_templates');
const jwt = require('jwt-simple');
const MaterialityModel = require('../models/materiality')
const CalculateSurveyResult = require('../services/materialityFormula');

exports.getSurveys = async function (req, res, next) {

  try {
    const surveyResults = await SurveyMonkey.getSurveys()

    for (let i = 0; i < surveyResults.length; i++) {
      const s = surveyResults[i]

      const rankingQuestions = await SurveyMonkey.getSurveyRankingQuestions(s.id)

      const survey = {
        surveyId: s.id,
        title: s.title,
        createdDate: s.date_created,
        modifiedDate: s.date_modified,
        previewLink: s.preview,
        editUrl: s.edit_url,
        questions: rankingQuestions,
      }

      await Survey.update({ surveyId: survey.surveyId }, survey, { upsert: true, setDefaultsOnInsert: true })
    }

    res.json({ message: 'Surveys synced', data: surveyResults })
  } catch (error) {
    next(error)
  }
}

exports.sendReminder = async function (req, res, next) {

  const { projectSurveyId } = req.params

  try {
    // get internal external holders that is not finished the survey
    const projectSurvey = await ProjectSurvey.findById(projectSurveyId);
    const internalHolders = get(projectSurvey, 'internal.recipients', [])
      .filter(object => object.status !== 'completely_responded');
    const externalHolders = get(projectSurvey, 'external.recipients', [])
      .filter(object => object.status !== 'completely_responded');
    const agencyModel = await Agency.findById(projectSurvey.agency)
    const companyModel = await Company.findOne({ agency: agencyModel.id });

    // send to internal and external holders
    const emailsObject = [];
    for (var holder of internalHolders) {
      // get side id by project id, holderid, type
      const type = 'internal';
      console.log(projectSurveyId, holder.employee.toString(), type);
      const { sideID } = await SSurvey.findOne({ projectSurveyID: ObjectId(projectSurveyId), type: type, stakeholderID: holder.employee });

      emailsObject.push({
        email: holder.email,
        sideID: sideID,
        type: type
      });
    }

    for (var holder of externalHolders) {
      // get side id by project id, holderid, type
      const type = 'external';
      console.log(projectSurveyId, holder.stakeholder.toString(), type);
      const { sideID } = await SSurvey.findOne({ projectSurveyID: ObjectId(projectSurveyId), type: type, stakeholderID: holder.stakeholder });

      // get side id
      emailsObject.push({
        email: holder.email,
        sideID: sideID,
        type: type
      });
    }

    // CSR-103
    const { internalReminderEmailTemplate, externalReminderEmailTemplate } = companyModel;
    await sendSurveyEmail(emailsObject, companyModel.name, externalReminderEmailTemplate, internalReminderEmailTemplate, true);

    const reminderSendDate = new Date()
    await ProjectSurvey.findByIdAndUpdate(projectSurveyId,
      {
        'reminderSendDate': reminderSendDate,
      });

    return Response(res, '', { internalHolders: internalHolders, externalHolders: externalHolders }, 200);
  } catch (error) {
    console.log("Error:", error.message);
    return Response(res, error.message);
  }
}

exports.closeSurvey = async function (req, res, next) {

  const { projectSurveyId } = req.params

  try {

    const projectSurvey = await ProjectSurvey.findById(projectSurveyId)
    const { internal, external } = projectSurvey
    const project = await ProjectModel.findById(projectSurvey.project)
    const internalSurvey = await Survey.findById(internal.survey)
    const externalSurvey = await Survey.findById(external.survey)

    // Get results
    const externalSurveyResponses = await SurveyMonkey.getSurveyResults(external.collectorId)
    const internalSurveyResponses = await SurveyMonkey.getSurveyResults(internal.collectorId)

    // 257458573
    // console.log("------------------>", JSON.stringify(externalSurveyResponses), JSON.stringify(internalSurveyResponses));

    for (let i = 0; i < externalSurveyResponses.length; i++) {
      const response = externalSurveyResponses[i]
      var surveyRecipient = find(external.recipients, { recipientId: response.recipientId })
      if (!surveyRecipient) {
        surveyRecipient = find(external.recipients, { email: response.email })
        if (surveyRecipient) {
          surveyRecipient.status = 'completely_responded'
          surveyRecipient.recipientId = response.recipientId;
          surveyRecipient.responseDate = new Date();
          var rest = await ProjectSurvey.findOneAndUpdate(
            { 'external.recipients._id': surveyRecipient.id },
            {
              $set:
              {
                'external.recipients.$.responseDate': new Date(),
                'external.recipients.$.status': 'completely_responded',
                'external.recipients.$.recipientId': response.recipientId,
              }
            })
        }

      } else {
        //In case the Web hook didnt worked properly 

        if (surveyRecipient.status != 'completely_responded') {
          surveyRecipient.status = 'completely_responded'

          surveyRecipient.responseDate = new Date();
          var rest = await ProjectSurvey.findOneAndUpdate(
            { 'external.recipients._id': surveyRecipient.id },
            {
              $set:
              {
                'external.recipients.$.responseDate': new Date(),
                'external.recipients.$.status': 'completely_responded'
              }
            })
        }
      }


      if (surveyRecipient) {
        let coreSubjectData = []
        let issueOfInterestData = []

        for (let j = 0; j < externalSurvey.questions.length; j++) {
          const question = externalSurvey.questions[j]
          const questionResponse = find(response.responses, { id: question.id })

          if (question.resultsType === 'coreSubjects') {
            coreSubjectData = questionResponse.answers.map(answer => {
              return {
                coreSubject: get(find(question.options, { id: answer.option }), 'text'),
                rating: get(find(question.values, { id: answer.value }), 'value'),
              }
            })
          } else {
            const issueOfInt = questionResponse.answers.map(answer => {
              return {
                issueOfInterest: get(find(question.options, { id: answer.option }), 'text'),
                rating: get(find(question.values, { id: answer.value }), 'value'),
              }
            })

            issueOfInterestData.push({ coreSubject: question.resultsType, data: issueOfInt })
          }
        }

        // console.log("Update stakeholder results: coreSubjectData:", coreSubjectData);
        // console.log("Update stakeholder results: issueOfInterestData:", issueOfInterestData);
        await updateStakeholderResults(project.materiality, surveyRecipient.stakeholder, coreSubjectData, issueOfInterestData)
      }
    }

    for (let i = 0; i < internalSurveyResponses.length; i++) {
      const response = internalSurveyResponses[i]
      var surveyRecipient = find(internal.recipients, { recipientId: response.recipientId })
      if (!surveyRecipient) {
        surveyRecipient = find(internal.recipients, { email: response.email })
        if (surveyRecipient) {
          surveyRecipient.status = 'completely_responded'
          surveyRecipient.recipientId = response.recipientId;
          surveyRecipient.responseDate = new Date();
          var rest = await ProjectSurvey.findOneAndUpdate(
            { 'internal.recipients._id': surveyRecipient.id },
            {
              $set:
              {
                'internal.recipients.$.responseDate': new Date(),
                'internal.recipients.$.status': 'completely_responded',
                'internal.recipients.$.recipientId': response.recipientId,
              }
            })
        }

      } else {
        //In case the Web hook didnt worked properly 

        if (surveyRecipient.status != 'completely_responded') {
          surveyRecipient.status = 'completely_responded'

          surveyRecipient.responseDate = new Date();
          var rest = await ProjectSurvey.findOneAndUpdate(
            { 'internal.recipients._id': surveyRecipient.id },
            {
              $set:
              {
                'internal.recipients.$.responseDate': new Date(),
                'internal.recipients.$.status': 'completely_responded'
              }
            })
        }
      }

      if (surveyRecipient) {
        let coreSubjectData = []
        let issueOfInterestData = []

        for (let j = 0; j < internalSurvey.questions.length; j++) {
          const question = internalSurvey.questions[j]
          const questionResponse = find(response.responses, { id: question.id })

          if (question.resultsType === 'coreSubjects') {
            coreSubjectData = questionResponse.answers.map(answer => {
              return {
                coreSubject: get(find(question.options, { id: answer.option }), 'text'),
                rating: get(find(question.values, { id: answer.value }), 'value'),
              }
            })
          } else {
            const issueOfInt = questionResponse.answers.map(answer => {
              return {
                issueOfInterest: get(find(question.options, { id: answer.option }), 'text'),
                rating: get(find(question.values, { id: answer.value }), 'value'),
              }
            })

            issueOfInterestData.push({ coreSubject: question.resultsType, data: issueOfInt })
          }
        }
        // console.log("Update employee results: coreSubjectData:", coreSubjectData);
        // console.log("Update employee results: issueOfInterestData:", issueOfInterestData);
        await updateEmployeeResults(project.materiality, surveyRecipient.employee, coreSubjectData, issueOfInterestData)
      }
    }

    //Check if all surveys are completed and then close 
    const checkclosed = await ProjectSurvey.find({
      $and: [{ _id: ObjectId(projectSurveyId) },
      {
        $or: [
          { 'internal.recipients': { $elemMatch: { 'status': 'not_responded' } } },
          { 'external.recipients': { $elemMatch: { 'status': 'not_responded' } } }
        ]
      }
      ]
    })
    if (checkclosed.length == 0) {
      if (projectSurvey.status !== 'closed') {
        await SurveyMonkey.closeSurvey(internal.collectorId)
        await SurveyMonkey.closeSurvey(external.collectorId)
        await ProjectSurvey.findByIdAndUpdate(projectSurveyId, { status: 'closed', closeDate: new Date() })
        await ProjectModel.findOneAndUpdate({ _id: project.id }, { $set: { status: 'MaterialityCompleted' } })
      }
    }

    res.json({ message: 'Survey closed' })
  } catch (error) {
    next(error)
  }
}

exports.receiveInternalResponse = async function (req, res, next) {

  const { projectSurveyId } = req.params

  const {
    event_datetime,
    resources: {
      recipient_id,
    } } = req.body

  try {
    if (!event_datetime || !recipient_id) {
      logger.debug('The request is not valid: (!event_datetime || !recipient_id)')
      throw new Error('The request is not valid')
    }

    await ProjectSurvey.updateOne(
      { '_id': projectSurveyId, 'internal.recipients.recipientId': recipient_id },
      {
        $set:
        {
          'internal.recipients.$.responseDate': event_datetime,
          'internal.recipients.$.status': 'completely_responded',
        }
      })

    res.json({ message: 'Response received' })
  } catch (error) {
    logger.debug(error)
    next(error)
  }
}

exports.receiveExternalResponse = async function (req, res, next) {

  const { projectSurveyId } = req.params

  const {
    event_datetime,
    resources: {
      recipient_id,
    } } = req.body

  try {
    if (!event_datetime || !recipient_id) {
      logger.debug('The request is not valid: (!event_datetime || !recipient_id)')
      throw new Error('The request is not valid')
    }

    await ProjectSurvey.updateOne(
      { '_id': projectSurveyId, 'external.recipients.recipientId': recipient_id },
      {
        $set:
        {
          'external.recipients.$.responseDate': event_datetime,
          'external.recipients.$.status': 'completely_responded',
        }
      })

    res.json({ message: 'Response received' })
  } catch (error) {
    logger.debug(error)
    next(error)
  }
}

exports.receiveResponseCheck = async function (req, res, next) {
  res.json({ message: 'Response received' })
}

const sendSurveyEmail = async (emailsObject, companyName, externalEmailTemplate, internalEmailTemplate, reminder = false) => {
  const side = `https://${applicationUrl}/survey/`;


  function jsUcfirst(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }

  const mailOptions = (email, sideID, type, messageTemplate) => ({
    from: 'Resilisense <noreply@resilisense.com>', // sender address
    to: [email], // list of receivers
    subject: `${reminder ? "Reminder: " : ' '}${companyName} - CSR: Stakeholder Survey`, // Subject line
    html: ` 
    <!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN" "http://www.w3.org/TR/REC-html40/loose.dtd">
    <html>
    
    <body style="margin:0; padding: 0;">
      <div align="center">
        <table border="0" cellpadding="0" cellspacing="0" align="center" width="100%"
              style="
              font-family: Arial,Helvetica,sans-serif;
              max-width: 700px;"
        >
          <tr bgcolor="#A7BC38">
            <td colspan="5" height="40">&#160;</td>
          </tr>
          <tr bgcolor="#A7BC38">
            <td width="20">&#160;</td>
            <td width="20">&#160;</td>
            <td align="center" style="
              font-size: 29px;
              color:#FFFFFF;
              font-weight: normal;
              letter-spacing: 1px;
              line-height: 1;
              text-shadow: -1px -1px 1px rgba(0, 0, 0, 0.2);
              font-family: Arial,Helvetica,sans-serif;"
            >  ${companyName} <br/>
              - <br/>
              Corporate Social Responsibility (CSR) Survey for ${jsUcfirst(type)} Stakeholders  <br/>
            </td>
            <td width="20">&#160;</td>
            <td width="20">&#160;</td>
          </tr>
          <tr bgcolor="#A7BC38">
            <td colspan="5" height="40">&#160;</td>
          </tr>
          <tr>
            <td height="10" colspan="5">&#160;</td>
          </tr>
          <tr>
              <td height="20" colspan="5">&#160;</td>
          </tr>
          <tr>
            <td style="font-size: 14px;" align="left" valign="center" colspan="5">${messageTemplate ? messageTemplate : ''}</td>
          </tr>
          <tr>
              <td colspan="5" height="30">&#160;</td>
          </tr>          
          <tr style="color: #999999;font-size: 10px;">
              <td align="center" colspan="5"/>
          </tr>
          <tr>
              <td>&#160;</td>
              <td colspan="3">
                  <table border="0" cellpadding="0" cellspacing="0" align="center" style="background:#A7BC38; border-radius: 4px; border: 1px solid #BBBBBB; color:#FFFFFF; font-size:14px; letter-spacing: 1px; text-shadow: -1px -1px 1px rgba(0, 0, 0, 0.8); padding: 10px 18px;">
                      <tr>
                        <td align="center" valign="center">
                        <a href="${side}${sideID}" target="_blank&quot;" style="color:#FFFFFF; text-decoration:none;">Begin Survey</a>
                        </td>
                      </tr>
                  </table>
              </td>
              <td>&#160;</td>
          </tr>          
          <tr>
            <td height="20" colspan="5">
                &#160;
            </td> </tr> </table>
        </div>
    </body>    
    </html>`, // html body
  });

  for ({ email, sideID, type } of emailsObject) {
    // add extra model to preserve pending requests!
    try {
      // CSR-101
      await nodeMaler(mailOptions(email, encryptDecryptSideID(sideID, true), type,
        type === 'internal' ? internalEmailTemplate : externalEmailTemplate));
    } catch (error) {
      console.log("Email errror!!", error.message);
    }
  }
};

exports.sendSurvey = async function (req, res, next) {

  var { agency, project, internal, external } = req.body

  try {
    // CSR-103
    // get company by project id





    ///////////////

    const projectData = await ProjectModel.findById(project);
    const clonedsurvey = req.clonedsurvey;


    const companyID = projectData.company;
    const {
      externalEmailTemplate,
      internalEmailTemplate,
    } = await Company.findById(companyID);

    var projectSurveyID = null;
    var projectSurveyModel = null;

    const existingSurvey = await ProjectSurvey.findOne({ "project": projectData._id }).sort({ _id: -1 });

    if (!existingSurvey) {

      if (clonedsurvey) {
        await clonesurvey(clonedsurvey, project)
      } else {

        //Insert 
        const document = {
          agency,
          project,
          status: 'open',
          sendDate: new Date(),
          collectors: [],
          surveys: [],
          internal: {
            survey: '-',
            collectorId: '-',
            messageId: '-',
            recipients: internal.map(recipient => {
              // const addedRecipient = find(addedInternalRecipients, r => r.email === recipient.email)
              return {
                employee: recipient.id,
                recipientId: '-',// get(addedRecipient, 'id'),
                email: recipient.email,
                name: recipient.name,
                company: recipient.company,
                jobPosition: recipient.jobPosition,
                phone: recipient.phone,
              }
            }),
          },
          external: {
            survey: '-',
            collectorId: '-',
            messageId: '-',
            recipients: external.map(recipient => {
              // const addedRecipient = find(addedExternalRecipients, r => r.email === recipient.email)
              return {
                stakeholder: recipient.id,
                recipientId: '-',// get(addedRecipient, 'id'),
                email: recipient.email,
                name: recipient.name,
                company: recipient.company,
                jobPosition: recipient.jobPosition,
                phone: recipient.phone,
              }
            }),
          },
        }
        projectSurveyModel = new ProjectSurvey(document);
        await projectSurveyModel.save();
        projectSurveyID = projectSurveyModel._id;




      }



    } else {

      projectSurveyModel = existingSurvey;
      projectSurveyID = projectSurveyModel._id;

      let internalinit = [];
      for (let index = 0; index < internal.length; index++) {

        const internalexist = await ProjectSurvey.findOne({ _id: projectSurveyID, 'internal.recipients.email': internal[index].email })

        if (!internalexist) {
          internalinit.push(internal[index])
        }
      }
      internal = internalinit

      let externalinit = [];
      for (let index = 0; index < external.length; index++) {

        const externalexist = await ProjectSurvey.findOne({ _id: projectSurveyID, 'external.recipients.email': external[index].email })

        if (!externalexist) {
          externalinit.push(external[index])
        }
      }
      external = externalinit



      for (let index = 0; index < internal.length; index++) {
        let recipient = internal[index]


        await ProjectSurvey.findOneAndUpdate({ _id: projectSurveyID }, {
          $push: {
            'internal.recipients': {
              employee: recipient.id,
              recipientId: '-',// get(addedRecipient, 'id'),
              email: recipient.email,
              name: recipient.name,
              company: recipient.company,
              jobPosition: recipient.jobPosition,
              phone: recipient.phone,
            }

          }
        })


      }

      for (let index = 0; index < external.length; index++) {

        let recipient = external[index]


        await ProjectSurvey.findOneAndUpdate({ _id: projectSurveyID }, {
          $push: {
            'external.recipients': {
              stakeholder: recipient.id,
              recipientId: '-',// get(addedRecipient, 'id'),
              email: recipient.email,
              name: recipient.name,
              company: recipient.company,
              jobPosition: recipient.jobPosition,
              phone: recipient.phone,
            }

          }
        })

      }

    }

    const { name } = await Company.findOne({ "projects": projectSurveyModel.project });

    await ProjectModel
      .findOneAndUpdate({ _id: project }, { $set: { status: 'MaterialitySendSurvey' } })


    if (!clonedsurvey) {
      // create surveys
      const surveysDocs = [];
      const emailsSenderConstructor = [];
      for (var data of internal) {
        const sideID = mongoose.Types.ObjectId();
        surveysDocs.push(generateSurvey(true, data.id, projectSurveyID, sideID));
        // surveysDocs.push({
        //   stakeholderID: data.id,
        //   projectSurveyID: projectSurveyID,
        //   type: 'internal',
        //   sideID: sideID,
        //   questionnaire: internalTemplate,
        // });
        emailsSenderConstructor.push({
          email: data.email,
          sideID: sideID,
          type: 'internal',
        });
      }
      for (var data of external) {
        const sideID = mongoose.Types.ObjectId();
        surveysDocs.push(generateSurvey(false, data.id, projectSurveyID, sideID));
        // surveysDocs.push({
        //   stakeholderID: data.id,
        //   projectSurveyID: projectSurveyID,
        //   type: 'external',
        //   sideID: sideID,
        //   questionnaire: externalTemplate,
        // });
        emailsSenderConstructor.push({
          email: data.email,
          sideID: sideID,
          type: 'external',
        });
      }

      await SSurvey.insertMany(surveysDocs);
      await sendSurveyEmail(emailsSenderConstructor, name, externalEmailTemplate, internalEmailTemplate);


    }




    res.json({ message: 'Surveys sent' })
  } catch (error) {
    next(error)
  }
}

async function clonesurvey(projectSurveyId, newprojectid) {


  const projectSurvey = await ProjectSurvey.findById(projectSurveyId);


  const document = {
    agency: projectSurvey.agency,
    project: ObjectId(newprojectid),
    status: 'open',
    sendDate: new Date(),
    collectors: [],
    surveys: [],
    internal: projectSurvey.internal,
    external: projectSurvey.external,
  }

  //Save Project Survey
  const newprojectSurvey = new ProjectSurvey(document);

  await newprojectSurvey.save()




  //Save Surveys 
  const internalSurveys = await SSurvey.find({ type: 'internal', projectSurveyID: ObjectId(projectSurveyId) });
  const externalSurveys = await SSurvey.find({ type: 'external', projectSurveyID: ObjectId(projectSurveyId) });
  internalSurveys.forEach(async survey => {
    try {
      const document = {
        stakeholderID: survey.stakeholderID,
        projectSurveyID: ObjectId(newprojectSurvey._id),
        type: "internal",
        sideID: survey.sideID,
        questionnaire: survey.questionnaire,
        completed: false,
        modifiedDate: new Date(),
        createdDate: new Date()
      }
      const newsurvey = new SSurvey(document);
      const s = await newsurvey.save();

    } catch (error) {
      console.log('ERROR' + error)

    }

  })
  externalSurveys.forEach(async survey => {
    try {



      const document = {
        stakeholderID: survey.stakeholderID,
        projectSurveyID: ObjectId(newprojectSurvey._id),
        type: "external",
        sideID: survey.sideID,
        questionnaire: survey.questionnaire,
        completed: false,
        modifiedDate: new Date(),
        createdDate: new Date()
      }

      const newsurvey = new SSurvey(document);
      const s = await newsurvey.save();
    } catch (error) {
      console.log('ERROR' + error)
    }
  })

}


function generateSurvey(isInternal, stakeholderID, projectSurveyID, sideID) {
  return {
    stakeholderID: stakeholderID,
    projectSurveyID: projectSurveyID,
    type: isInternal ? 'internal' : 'external',
    sideID: sideID,
    questionnaire: isInternal ? internalTemplate : externalTemplate,
  };
}


exports.getSurveyBySideID = async function (req, res) {
  try {
    const showNotAnswredQuestions = req.query.showNotAnswredQuestions === 'true';

    var { sideid } = req.params;
    sideid = encryptDecryptSideID(sideid, false);
    const result = await (await SSurvey.findOne({ sideID: sideid })).toJSON();
    if (!result) {
      throw Error('Data not found');
    }

    var completed = true;
    result.questionnaire.questions = result.questionnaire.questions.map((question) => {
      completed = completed && (question.updatedOnce || !question.answerIsRequired);
      return {
        ...question,
        isAnswred: showNotAnswredQuestions ? (question.updatedOnce || !question.answerIsRequired) : true,
      }
    });
    result.completed = completed;

    // { $set: { status: "D" }
    // update to complete true
    const updateResult = await SSurvey.updateOne({ sideID: sideid }, { $set: { completed: completed } });
    if (!updateResult) {
      throw Error('Can not update to completed');
    }

    return Response(res, 'Get survey by id', result, 200);
  } catch (error) {
    return Response(res, error.message);
  }
}

// change status of projectSurvey to partially_responded (projectSurveyID + stakeholderID + type)
exports.updateSurveyAnswer = async function (req, res) {
  try {
    const { objectID, questionID, newAnswers } = req.body;

    var isAnswred = false;
    for (var answer of newAnswers) {
      isAnswred = isAnswred || answer.selected;
    }

    // update the answers of question from questionaire tha match the query 
    const { projectSurveyID, stakeholderID, type } = await SSurvey.findOneAndUpdate(
      { "_id": ObjectId(objectID), "questionnaire.questions": { "$elemMatch": { "_id": ObjectId(questionID) } } },
      { $set: { "questionnaire.questions.$.answers": newAnswers, "questionnaire.questions.$.updatedOnce": isAnswred } }
    );

    // change the status of projectSurvey
    const stakeHolderFieldName = type === 'internal' ? 'employee' : 'stakeholder';
    const result = await ProjectSurvey.update({ "_id": projectSurveyID, [`${type}.recipients`]: { "$elemMatch": { [stakeHolderFieldName]: stakeholderID } } },
      { $set: { [`${type}.recipients.$.status`]: 'partially_responded' } });

    if (!result) {
      throw Error('Survey project status not updated');
    }

    return Response(res, 'Update survey and projectSurvey status', {
      projectSurveyID: projectSurveyID,
      stakeholderID: stakeholderID,
      type: type,
    }, 200);

  } catch (error) {
    return Response(res, error.message);
  }
}

exports.completeSurvey = async function (req, res) {
  try {
    const { surveyID } = req.params;

    // get project survey id by survey id
    const { projectSurveyID, completed, stakeholderID, type } = await SSurvey.findById(surveyID);

    // check if the status is completed
    if (!completed) {
      throw Error('Survey Project can not completed because questionaire is not completed');
    }


    // update project survey status to completed
    const stakeHolderFieldName = type === 'internal' ? 'employee' : 'stakeholder';
    const result = await ProjectSurvey.findOneAndUpdate({ "_id": projectSurveyID, [`${type}.recipients`]: { "$elemMatch": { [stakeHolderFieldName]: stakeholderID } } },
      {
        $set: {
          [`${type}.recipients.$.status`]: 'completely_responded',
          [`${type}.recipients.$.responseDate`]: new Date(),
        },
      });

    return Response(res, 'Update status of project survey', result, 200);
  } catch (error) {
    return Response(res, error.message);
  }
}

exports.calculateSurveyResults = async function (req, res) {
  try {
    const { projectSurveyId } = req.params;
    const projectSurvey = await ProjectSurvey.findById(projectSurveyId);
    const project = await ProjectModel.findById(projectSurvey.project);

    // console.log("Project:", project, projectSurvey)
    const stakeholdersXFactorMap = {};
    // get groupXfactor of all stakeholders (stakeholder class)
    const materiality = await MaterialityModel.findById(project.materiality)
    if (!materiality) {
      throw new Error('Error cant find materiality')
    }

    // get group xfactor: CSR-
    const _stakeholders = materiality.stakeholders;
    for (var stakeholder of _stakeholders) {
      if (stakeholder.groupXFactor > 0) {
        stakeholdersXFactorMap[stakeholder.stakeholder.toString()] = stakeholder.groupXFactor;
      }
    }
    /*REMOVE chcek for closed
      //Check if all surveys are completed and then close 
      const checkclosed = await ProjectSurvey.find({
        $and: [{ _id: ObjectId(projectSurveyId) },
        {
          $or: [
            { 'internal.recipients': { $elemMatch: { 'status': 'not_responded' } } },
            { 'external.recipients': { $elemMatch: { 'status': 'not_responded' } } },
            { 'internal.recipients': { $elemMatch: { 'status': 'partially_responded' } } },
            { 'external.recipients': { $elemMatch: { 'status': 'partially_responded' } } }
          ]
        }
        ]
      });
      
      if (checkclosed.length > 0) {
        throw Error('Survey is not completed');
      }*/

    // const {internal, external} = await SSurvey.findById(projectSurveyId);
    const internalSurveys = await SSurvey.find({ type: 'internal', projectSurveyID: ObjectId(projectSurveyId) });
    const externalSurveys = await SSurvey.find({ type: 'external', projectSurveyID: ObjectId(projectSurveyId) });

    // console.log("Internal surveys:", internalSurveys.length, "External surveys:", externalSurveys.length)
    const updateResults = async (surveys, internal = false) => {
      const surveyData = [];
      for (var internalSurvey of surveys) {
        //Incorporate only Completed surveys
        if (internalSurvey.completed) {

          const internalSurveysQuestions = internalSurvey.questionnaire.questions;
          const collboratorID = internalSurvey.stakeholderID;
          // find collaborator class

          const coreSubjectData = [];
          const issueOfInterestData = [];

          // get question of coresubjects
          var coreSubjAnswers = null;
          for (var question of internalSurveysQuestions) {
            if (!question.id_in_template && question.type === questionTypes.order) {
              coreSubjAnswers = question.answers;
              break;
            }
          }

          for (var question of internalSurveysQuestions) {
            // console.log("Before:", question.);

            if (!question.id_in_template) {
              continue;
            }

            coreSubjectData.push({
              coreSubject: question.id_in_template,
              rating: (() => {
                for (var i = 0; i < coreSubjAnswers.length; i++) {
                  if (coreSubjAnswers[i].id_in_template == question.id_in_template) {
                    return (i + 1);
                  }
                }
                return null;
              })(),
              //  ++index,
            });

            // console.log("Internal Survey questions:", question.id_in_template);
            const answers = question.answers;
            const data = [];
            var nestedIndex = 0;
            for (var answer of answers) {
              data.push({
                issueOfInterest: answer.id_in_template,
                rating: ++nestedIndex,
              });
            }
            issueOfInterestData.push({
              coreSubject: question.id_in_template,
              data: data,
            });
          }

          // console.log("\n\nInput:", JSON.stringify(coreSubjectData), JSON.stringify(issueOfInterestData));
          // if (internal) {
          // await updateEmployeeResults(project.materiality, collboratorID, coreSubjectData, issueOfInterestData)
          // }else {
          // await updateStakeholderResults(project.materiality, collboratorID, coreSubjectData, issueOfInterestData)
          // }
          surveyData.push({
            isExternal: !internal,
            classValue: stakeholdersXFactorMap[collboratorID],
            issueOfInterest: issueOfInterestData,
            coreSubjects: coreSubjectData,
          });


        }

      }
      //
      return surveyData;
    }

    const dataInternal = await updateResults(internalSurveys, true);
    const dataExternal = await updateResults(externalSurveys, false);

    //Check if all surveys are completed and then close 
    /*  const checkclosed2 = await ProjectSurvey.find({
         $and: [{ _id: ObjectId(projectSurveyId) },
         {
           $or: [
             { 'internal.recipients': { $elemMatch: { 'status': 'not_responded' } } },
             { 'external.recipients': { $elemMatch: { 'status': 'not_responded' } } }
           ]
         }
         ]
       });*/

    // if (checkclosed2.length == 0) {
    //No need to check if there are closed surveys 

    if (projectSurvey.status !== 'closed') {
      await ProjectSurvey.findByIdAndUpdate(projectSurveyId, { status: 'closed', closeDate: new Date() })
      await ProjectModel.findOneAndUpdate({ _id: project.id }, { $set: { status: 'MaterialityCompleted' } })
    }
    //}    

    const result = CalculateSurveyResult.execute([...dataExternal, ...dataInternal]);

    // update materiality
    const materialityResult = await MaterialityModel.findByIdAndUpdate(project.materiality, { $set: { coreSubjects: result } });

    return Response(res, 'Calculate final result of survey', {
      // input: [...dataExternal, ...dataInternal],
      output: result,
      materialityResult: materialityResult,
    }, 201);
  } catch (error) {
    console.log("Close survey error:", error.message);
    return Response(res, error.message);
  }
}

exports.getSurveyTemplateSample = async function (req, res) {
  try {
    const { type } = req.params;
    if (type !== 'external' && type !== 'internal') {
      throw Error("Type not found", type);
    }
    return Response(res, '', generateSurvey(type === 'internal', null, null, null), 200);
  } catch (error) {
    return Response(res, error.message);
  }
}

function encryptDecryptSideID(text, encrypt = true) {
  const secret = 'survey';
  var token = null;
  if (encrypt) {
    token = jwt.encode(text, secret);
  } else {
    token = jwt.decode(text, secret);
  }
  return token;
}