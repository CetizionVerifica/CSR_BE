const axios = require('axios')
const {find, filter} = require('lodash')
const config = require('../config/keys')
const {coreSubjects, issueOfInterests} = require('./mappings')

const URL = 'https://api.surveymonkey.net/v3'
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `bearer ${config.surveyMonkeyToken}`,
}

const getSurveys = async function() {
  const response = await axios.get(
    `${URL}/surveys`, {
      params: {
        include: 'date_created,date_modified,preview,edit_url',
        per_page: 100,
      },
      headers,
    })

  const {data} = response.data

  // console.log("Get surveys output:", data);
  return data
}

function includeInTitle(title, text) {
  const charactersRegex = /[,'"]/g
  const spaceRegex = /\s{2,}/g
  const cleanTitle = title.replace(charactersRegex, '').replace(spaceRegex, ' ')
  const cleanText = text.replace(charactersRegex, '').replace(spaceRegex, ' ')
  return cleanTitle.toLowerCase().indexOf(cleanText.toLowerCase()) !== -1
}

const getSurveyRankingQuestions = async function(surveyId) {
  const response = await axios.get(`${URL}/surveys/${surveyId}/details`, {headers})

  const questions = []
  const {pages} = response.data

  pages.forEach(page => {
    page.questions.forEach(question => {
      if (question.subtype === 'ranking' && question.visible) {
        const title = question.headings[0].heading

        const coreSubject = find(coreSubjects, cs => includeInTitle(title, cs.text))
        const options = coreSubject ? filter(issueOfInterests, issue => issue.coreSubject === coreSubject.value) : coreSubjects
        const type = coreSubject ? coreSubject.value : 'coreSubjects'

        questions.push({
          id: question.id,
          title: title,
          position: question.position,
          resultsType: type,
          options: question.answers.rows.map(row => {
            const option = find(options, cs => includeInTitle(row.text, cs.text))
            return {id: row.id, text: option.value}
          }),
          values: question.answers.choices.map(choice => ({id: choice.id, value: Number(choice.text)})),
        })
      }
    })
  })

  console.log("Get survey questions:", questions);
  return questions
}

const createSurveyCollector = async function(surveyId, agencyEmail) {
  //const response = await axios.post(`${URL}/surveys/${surveyId}/collectors`, {type: 'email', sender_email: agencyEmail}, {headers})
  const response = await axios.post(`${URL}/surveys/${surveyId}/collectors`, {type: 'email'}, {headers})
  return response.data
}

const addMessageToCollector = async function(collectorId, title, emailTemplate) {
const body = "\n<html>\n\n<body style=\"margin:0; padding: 0;\">\n    <div align=\"center\">\n        <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" align=\"center\" width=\"100%\" style=\"font-family: Arial,Helvetica,sans-serif; max-width: 700px;\">\n            <tr bgcolor=\"#A7BC38\">\n                <td colspan=\"5\" height=\"40\">\u00a0<\/td> <\/tr>\n            <tr bgcolor=\"#A7BC38\">\n                <td width=\"20\">\u00a0<\/td>\n                <td width=\"20\">\u00a0<\/td>\n                <td align=\"center\" style=\"font-size: 29px; color:#FFFFFF; font-weight: normal; letter-spacing: 1px; line-height: 1;                           text-shadow: -1px -1px 1px rgba(0, 0, 0, 0.2); font-family: Arial,Helvetica,sans-serif;\">" +title+"<\/td>\n                <td width=\"20\">\u00a0<\/td>\n                <td width=\"20\">\u00a0<\/td> <\/tr>\n            <tr bgcolor=\"#A7BC38\">\n                <td colspan=\"5\" height=\"40\">\u00a0<\/td> <\/tr>\n            <tr>\n                <td height=\"10\" colspan=\"5\">\u00a0<\/td> <\/tr>\n            <tr>\n                <td>\u00a0<\/td>\n                <td colspan=\"3\" align=\"left\" valign=\"top\" style=\"color:#666666; font-size: 13px;\"> \n                    <p>"+emailTemplate+"<\/p>  <\/td>\n                <td>\u00a0<\/td> <\/tr> \n            <tr>\n                <td colspan=\"5\" height=\"30\">\u00a0<\/td> <\/tr>\n            <tr>\n                <td>\u00a0<\/td>\n                <td colspan=\"3\">\n                    <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" align=\"center\" style=\"background:#A7BC38; border-radius: 4px; border: 1px solid #BBBBBB; color:#FFFFFF; font-size:14px; letter-spacing: 1px; text-shadow: -1px -1px 1px rgba(0, 0, 0, 0.8); padding: 10px 18px;\">\n                        <tr>\n                            <td align=\"center\" valign=\"center\"> <a href=\"[SurveyLink]\" target=\_blank\" style=\"color:#FFFFFF; text-decoration:none;\">Begin Survey<\/a> <\/td> <\/tr> <\/table> <\/td>\n                <td>\u00a0<\/td> <\/tr>\n            <tr>\n                <td colspan=\"5\" height=\"30\">\u00a0<\/td> <\/tr> \n            <tr valign=\"top\" style=\"color: #666666;font-size: 10px;\">\n                <td>\u00a0<\/td>\n                <td valign=\"top\" align=\"center\" colspan=\"3\">\n                    <p>Please do not forward this email as its survey link is unique to you.\n                        <br><a href=\"[PrivacyLink]\" target=\"_blank\" style=\"color: #333333; text-decoration: underline;\">Privacy<\/a> | <a href=\"[OptOutLink]\" target=\"_blank\" style=\"color: #333333; text-decoration: underline;\">Unsubscribe<\/a> from this list<\/p> <\/td>\n                <td>\u00a0<\/td> <\/tr>\n            <tr>\n                <td height=\"20\" colspan=\"5\">\u00a0<\/td> <\/tr>\n            <tr style=\"color: #999999;font-size: 10px;\">\n                <td align=\"center\" colspan=\"5\">[FooterLink]<\/td> <\/tr>\n            <tr>\n                <td height=\"20\" colspan=\"5\">\u00a0<\/td> <\/tr> <\/table><\/div><\/body>\n\n<\/html>\n";

  const response = await axios.post(`${URL}/collectors/${collectorId}/messages`, {type: 'invite',body_html:body, is_branding_enabled:false}, {headers})
  return response.data
}

const addReminderToCollector = async function(collectorId, title, emailTemplate) {
const body = "\n<html>\n\n<body style=\"margin:0; padding: 0;\">\n    <div align=\"center\">\n<table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" align=\"center\" width=\"100%\" style=\"font-family: Arial,Helvetica,sans-serif; max-width: 700px;\">\n            <tr bgcolor=\"#A7BC38\">\n                <td colspan=\"5\" height=\"40\">\u00a0<\/td> <\/tr>\n            <tr bgcolor=\"#A7BC38\">\n                <td width=\"20\">\u00a0<\/td>\n                <td width=\"20\">\u00a0<\/td>\n                <td align=\"center\" style=\"font-size: 29px; color:#FFFFFF; font-weight: normal; letter-spacing: 1px; line-height: 1;                           text-shadow: -1px -1px 1px rgba(0, 0, 0, 0.2); font-family: Arial,Helvetica,sans-serif;\">" +title+"<\/td>\n                <td width=\"20\">\u00a0<\/td>\n                <td width=\"20\">\u00a0<\/td> <\/tr>\n            <tr bgcolor=\"#A7BC38\">\n                <td colspan=\"5\" height=\"40\">\u00a0<\/td> <\/tr>\n            <tr>\n                <td height=\"10\" colspan=\"5\">\u00a0<\/td> <\/tr>\n            <tr>\n                <td>\u00a0<\/td>\n                <td colspan=\"3\" align=\"left\" valign=\"top\" style=\"color:#666666; font-size: 13px;\"> \n                    <p>"+emailTemplate+"<\/p>  <\/td>\n                <td>\u00a0<\/td> <\/tr> \n            <tr>\n                <td colspan=\"5\" height=\"30\">\u00a0<\/td> <\/tr>\n            <tr>\n                <td>\u00a0<\/td>\n                <td colspan=\"3\">\n                    <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" align=\"center\" style=\"background:#A7BC38; border-radius: 4px; border: 1px solid #BBBBBB; color:#FFFFFF; font-size:14px; letter-spacing: 1px; text-shadow: -1px -1px 1px rgba(0, 0, 0, 0.8); padding: 10px 18px;\">\n                        <tr>\n                            <td align=\"center\" valign=\"center\"> <a href=\"[SurveyLink]\" target=\_blank\" style=\"color:#FFFFFF; text-decoration:none;\">Begin Survey<\/a> <\/td> <\/tr> <\/table> <\/td>\n                <td>\u00a0<\/td> <\/tr>\n            <tr>\n                <td colspan=\"5\" height=\"30\">\u00a0<\/td> <\/tr> \n            <tr valign=\"top\" style=\"color: #666666;font-size: 10px;\">\n                <td>\u00a0<\/td>\n                <td valign=\"top\" align=\"center\" colspan=\"3\">\n                    <p>Please do not forward this email as its survey link is unique to you.\n                        <br><a href=\"[PrivacyLink]\" target=\"_blank\" style=\"color: #333333; text-decoration: underline;\">Privacy<\/a> | <a href=\"[OptOutLink]\" target=\"_blank\" style=\"color: #333333; text-decoration: underline;\">Unsubscribe<\/a> from this list<\/p> <\/td>\n                <td>\u00a0<\/td> <\/tr>\n            <tr>\n                <td height=\"20\" colspan=\"5\">\u00a0<\/td> <\/tr>\n            <tr style=\"color: #999999;font-size: 10px;\">\n                <td align=\"center\" colspan=\"5\">[FooterLink]<\/td> <\/tr>\n            <tr>\n                <td height=\"20\" colspan=\"5\">\u00a0<\/td> <\/tr> <\/table><\/div><\/body>\n\n<\/html>\n";

  const response = await axios.post(`${URL}/collectors/${collectorId}/messages`, {type: 'reminder', body_html:body, recipient_status: 'has_not_responded',is_branding_enabled:false} , {headers})

  return response.data
}

const addRecipientsToMessage = async function(collectorId, messageId, contacts) {
  const response = await axios.post(
    `${URL}/collectors/${collectorId}/messages/${messageId}/recipients/bulk`, {contacts}, {headers})

  const {succeeded} = response.data
  return succeeded
}

const sendMessage = async function(collectorId, messageId) {
  const response = await axios.post(`${URL}/collectors/${collectorId}/messages/${messageId}/send`, {}, {headers})

  return response.data
}

const closeSurvey = async function(collectorId) {
  const response = await axios.patch(`${URL}/collectors/${collectorId}`, {status: 'closed'}, {headers})

  return response.data
}

const addWebhook = async function(collectorId, projectSurvey, type) {
  const data = {
    name: 'Survey response webhook',
    event_type: 'response_completed',
    object_type: 'collector',
    object_ids: [collectorId],
    subscription_url: `https://${config.applicationUrl}/api/surveys/receiveResponse/${type}/${projectSurvey}`,
  }

  const response = await axios.post(`${URL}/webhooks`, data, {headers})

  return response.data
}

const getSurveyResults = async function(collectorId) {

  let page = 1
  let hasMore = true
  let per_page = 100
  const results = []

  while (hasMore) {
    const response = await axios.get(`${URL}/collectors/${collectorId}/responses/bulk`, {
      params: {
        status: 'completed',
        per_page,
        page,
      },
      headers,
    })

    const {total, data} = response.data
    hasMore = total > page * per_page
    page++

    data.forEach(({recipient_id, pages , metadata }) => {

      const result = {
        recipientId: recipient_id,
        email :  metadata.contact.email.value,
        responses: pages[0].questions.map(question => ({
          id: question.id,
          answers: question.answers.map(answer => ({
            option: answer.row_id,
            value: answer.choice_id,
          })),
        })),
      }

      results.push(result)
    })
  }

  return results
}

const editSurveyTitle = async function(surveyId, title, body) {

  const response = await axios.patch(`${URL}/surveys/${surveyId}`, {title: title}, {headers})

  return response.data
}
const editEmailBody = async function(collectorId, messageId, surveyTitle, url, body) {
//body = "\n<html>\n\n<body style=\"margin:0; padding: 0;\">\n    <div align=\"center\">\n        <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" align=\"center\" width=\"100%\" style=\"font-family: Arial,Helvetica,sans-serif; max-width: 700px;\">\n            <tr bgcolor=\"#A7BC38\">\n                <td colspan=\"5\" height=\"40\">\u00a0<\/td> <\/tr>\n            <tr bgcolor=\"#A7BC38\">\n                <td width=\"20\">\u00a0<\/td>\n                <td width=\"20\">\u00a0<\/td>\n                <td align=\"center\" style=\"font-size: 29px; color:#FFFFFF; font-weight: normal; letter-spacing: 1px; line-height: 1;                           text-shadow: -1px -1px 1px rgba(0, 0, 0, 0.2); font-family: Arial,Helvetica,sans-serif;\">" +surveyTitle+"<\/td>\n                <td width=\"20\">\u00a0<\/td>\n                <td width=\"20\">\u00a0<\/td> <\/tr>\n            <tr bgcolor=\"#A7BC38\">\n                <td colspan=\"5\" height=\"40\">\u00a0<\/td> <\/tr>\n            <tr>\n                <td height=\"10\" colspan=\"5\">\u00a0<\/td> <\/tr>\n            <tr>\n                <td>\u00a0<\/td>\n                <td colspan=\"3\" align=\"left\" valign=\"top\" style=\"color:#666666; font-size: 13px;\"> \n                    <p>"+body+ "[SurveyLink]<\/p>  <\/td>\n                <td>\u00a0<\/td> <\/tr> \n            <tr>\n                <td colspan=\"5\" height=\"30\">\u00a0<\/td> <\/tr>\n            <tr>\n                <td>\u00a0<\/td>\n                <td colspan=\"3\">\n                    <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" align=\"center\" style=\"background:#A7BC38; border-radius: 4px; border: 1px solid #BBBBBB; color:#FFFFFF; font-size:14px; letter-spacing: 1px; text-shadow: -1px -1px 1px rgba(0, 0, 0, 0.8); padding: 10px 18px;\">\n                        <tr>\n                            <td align=\"center\" valign=\"center\"> <a href=\"[SurveyLink]\" target=\_blank\" style=\"color:#FFFFFF; text-decoration:none;\">Begin Survey<\/a> <\/td> <\/tr> <\/table> <\/td>\n                <td>\u00a0<\/td> <\/tr>\n            <tr>\n                <td colspan=\"5\" height=\"30\">\u00a0<\/td> <\/tr> \n            <tr valign=\"top\" style=\"color: #666666;font-size: 10px;\">\n                <td>\u00a0<\/td>\n                <td valign=\"top\" align=\"center\" colspan=\"3\">\n                    <p>Please do not forward this email as its survey link is unique to you.\n                        <br><a href=\"[PrivacyLink]\" target=\"_blank\" style=\"color: #333333; text-decoration: underline;\">Privacy<\/a> | <a href=\"[OptOutLink]\" target=\"_blank\" style=\"color: #333333; text-decoration: underline;\">Unsubscribe<\/a> from this list<\/p> <\/td>\n                <td>\u00a0<\/td> <\/tr>\n            <tr>\n                <td height=\"20\" colspan=\"5\">\u00a0<\/td> <\/tr>\n            <tr style=\"color: #999999;font-size: 10px;\">\n                <td align=\"center\" colspan=\"5\">[FooterLink]<\/td> <\/tr>\n            <tr>\n                <td height=\"20\" colspan=\"5\">\u00a0<\/td> <\/tr> <\/table><\/div><\/body>\n\n<\/html>\n";
body2 ='<a href="[SurveyLink]">Take the survey!</a> <br/> <a href="[OptOutLink]">OptOutLink</a> <br/> <a href="[PrivacyLink]">PrivacyLink</a> <br/> <a href="[FooterLink]">FooterLink</a> <br/>'
  //body + " [SurveyLink], [OptOutLink], [PrivacyLink] [FooterLink]";
  const response = await axios.patch(`${URL}/collectors/${collectorId}/messages/${messageId}`, {body_html:body2}, {headers})
  return response.data
}


module.exports = {
  getSurveys,
  getSurveyRankingQuestions,
  createSurveyCollector,
  addMessageToCollector,
  addReminderToCollector,
  addRecipientsToMessage,
  sendMessage,
  closeSurvey,
  addWebhook,
  getSurveyResults,
  editSurveyTitle,
  editEmailBody
}
