const {findIndex} = require('lodash')
const MaterialityModel = require('../models/materiality')
const {
  updateCoreSubjectsStakeholders,
  updateStakeholderCoreSubjectsRating,
  updateCoreSubjectsMateriality,
  updateStakeholderIssueOfInertestRating,
  updateStakeholdersGroup,

  updateEmployeeCoreSubjectsRating,
  updateEmployeesGroup,
  updateCoreSubjectsEmployees,
  updateEmployeeIssueOfInterestRating,
  updateEmployeeCoreSubjectsMateriality,
} = require('../schema/mutations/materiality/_helper')

const updateStakeholderCoreSubjects = async function(materialityId, stakeholderId, data) {

  const materiality = await MaterialityModel.findById(materialityId)
  if (!materiality) {
    throw new Error('Error cant find materiality')
  }

  const indexStakeholder =
    findIndex(materiality.stakeholders,
      s => s.stakeholder.toString() === stakeholderId)
  materiality.stakeholders[indexStakeholder] =
    updateStakeholderCoreSubjectsRating(materiality.stakeholders[indexStakeholder], data)
  const coreSubjects = updateCoreSubjectsStakeholders(materiality, data)

  await MaterialityModel.findByIdAndUpdate(materialityId, {
    stakeholders: [...materiality.stakeholders],
    coreSubjects: coreSubjects,
    updatedDate: new Date(),
  })
}

const updateStakeholderIssueOfInterest = async function(materialityId, stakeholderId, coreSubject, data) {

  const materiality = await MaterialityModel.findById(materialityId)
  if (!materiality) {
    throw new Error('Error cant find materiality')
  }

  const indexStakeholder =
    findIndex(materiality.stakeholders,
      s => s.stakeholder.toString() === stakeholderId)
  materiality.stakeholders[indexStakeholder] =
    updateStakeholderIssueOfInertestRating(
      materiality.stakeholders[indexStakeholder],
      coreSubject,
      data)
  const coreSubjects = updateCoreSubjectsMateriality(materiality, coreSubject, data)

  await MaterialityModel.findByIdAndUpdate(materialityId, {
    stakeholders: [...materiality.stakeholders],
    coreSubjects: coreSubjects,
    updatedDate: new Date(),
  })
}

const updateStakeholderResults = async function(materialityId, stakeholderId, coreSubjectData, issueOfInterests) {

  var groupXFactor = 1
  const materiality = await MaterialityModel.findById(materialityId)
  if (!materiality) {
    throw new Error('Error cant find materiality')
  }

  // get group xfactor: CSR-
  const _stakeholders = materiality.stakeholders;
  for (var stakeholder of _stakeholders) {
    if (stakeholder.stakeholder.toString() === stakeholderId.toString()) {
      groupXFactor = stakeholder.groupXFactor;
      break;
    }
  }
  // // // // // 

  const updateMateriality = await MaterialityModel
    .findOneAndUpdate({'_id': materialityId, 'stakeholders.stakeholder': stakeholderId},
      {$set: {'stakeholders.$.groupXFactor': groupXFactor}}, {new: true}).exec()

  const stakeholders =
       updateStakeholdersGroup(updateMateriality, materiality, stakeholderId, groupXFactor)
  let coreSubjects = updateCoreSubjectsStakeholders(materiality, materiality.coreSubjects)

  const indexStakeholder =
    findIndex(stakeholders,
      s => s.stakeholder.toString() === stakeholderId.toString())

  stakeholders[indexStakeholder] =
    updateStakeholderCoreSubjectsRating(stakeholders[indexStakeholder], coreSubjectData)
  coreSubjects = updateCoreSubjectsStakeholders(materiality, coreSubjectData)

  issueOfInterests.forEach(issue => {
    stakeholders[indexStakeholder] =
    updateStakeholderIssueOfInertestRating(
      stakeholders[indexStakeholder],
      issue.coreSubject,
      issue.data)
    coreSubjects = updateCoreSubjectsMateriality(materiality, issue.coreSubject, issue.data)
  })

  await MaterialityModel.findByIdAndUpdate(materialityId, {
    stakeholders: [...stakeholders],
    coreSubjects: coreSubjects,
    updatedDate: new Date(),
  })
}
/*
const updateEmployeeResults = async function(materialityId, employeeId, coreSubjectData, issueOfInterests) {

  const groupXFactor = 1
  const materiality = await MaterialityModel.findById(materialityId)
  if (!materiality) {
    throw new Error('Error cant find materiality')
  }

  const updateMateriality = await MaterialityModel
    .findOneAndUpdate({'_id': materialityId, 'employees.employee': employeeId},
      {$set: {'employees.$.groupXFactor': groupXFactor}}, {new: true}).exec()

  const employees =
       updateEmployeesGroup(updateMateriality, materiality, employeeId, groupXFactor)
  let coreSubjects = updateCoreSubjectsEmployees(materiality, materiality.coreSubjects)

  const indexEmployee =
    findIndex(employees,
      s => s.employee.toString() === employeeId.toString())

  employees[indexEmployee] =
    updateEmployeeCoreSubjectsRating(employees[indexEmployee], coreSubjectData)
  coreSubjects = updateCoreSubjectsEmployees(materiality, coreSubjectData)

  issueOfInterests.forEach(issue => {
    employees[indexEmployee] =
    updateEmployeeIssueOfInterestRating(
      employees[indexEmployee],
      issue.coreSubject,
      issue.data)
    coreSubjects = updateEmployeeCoreSubjectsMateriality(materiality, issue.coreSubject, issue.data)
  })


  await MaterialityModel.findByIdAndUpdate(materialityId, {
    employees: [...employees],
    coreSubjects: coreSubjects,
    updatedDate: new Date(),
  })
}
*/
const updateEmployeeResults = async function(materialityId, employeeId, coreSubjectData, issueOfInterests) {

  const materiality = await MaterialityModel.findById(materialityId)
  if (!materiality) {
    throw new Error('Error cant find materiality')
  }

  let updateMateriality = await MaterialityModel.findOne({'_id': materialityId, 'stakeholders.stakeholder': employeeId})

  if (!updateMateriality) {
    updateMateriality = await MaterialityModel
      .findOneAndUpdate({_id: materialityId},
        {$push: {
          stakeholders: {
            stakeholder: employeeId,
            isCompany: true,
            credits: 250, // need to move to config
            weightValue: 0.5,
          },
        }}).exec()
  }

  updateMateriality = await MaterialityModel.findOne({'_id': materialityId, 'stakeholders.stakeholder': employeeId})

  const indexStakeholder =
      findIndex(updateMateriality.stakeholders,
        s => s.stakeholder.toString() === employeeId.toString())
  updateMateriality.stakeholders[indexStakeholder] =
      updateStakeholderCoreSubjectsRating(updateMateriality.stakeholders[indexStakeholder], coreSubjectData)
  
  // console.log("\n\n\n")
  // console.log("updateMateriality.stakeholders[indexStakeholder]", JSON.stringify(updateMateriality.stakeholders[indexStakeholder]));
  updateMateriality.coreSubjects = updateCoreSubjectsStakeholders(materiality, coreSubjectData)
  // console.log("\nupdateMateriality.coreSubjects", JSON.stringify(updateMateriality.coreSubjects));

  issueOfInterests.forEach(ioi => {
    updateMateriality.stakeholders[indexStakeholder] =
    updateStakeholderIssueOfInertestRating(
      updateMateriality.stakeholders[indexStakeholder],
      ioi.coreSubject,
      ioi.data)
    updateMateriality.coreSubjects = updateCoreSubjectsMateriality(updateMateriality, ioi.coreSubject, ioi.data)
  })

  await MaterialityModel.findByIdAndUpdate(materialityId, {
    stakeholders: [...updateMateriality.stakeholders],
    coreSubjects: updateMateriality.coreSubjects,
    updatedDate: new Date(),
  })
}

module.exports = {
  updateStakeholderCoreSubjects,
  updateStakeholderIssueOfInterest,
  updateStakeholderResults,
  updateEmployeeResults,
}
