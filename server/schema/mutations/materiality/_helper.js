const {find, sumBy, sum} = require('lodash')
const TotelCredits = 500
const stakeholdersTotelCredits = TotelCredits / 2
//const companyTotelCredits = TotelCredits / 2

const stakeholdersXfactorSum = (stakeholders) => {
  return sumBy(stakeholders, 'groupXFactor')
}

const relevanceValueByRating = (divider, rating) => {
  return (100 / divider) * (divider - rating + 1)
}

const stakeholderCreditAndWeight = (stakeholders, xfactor) => {
  return stakeholders.map(stakeholder => {
    if (stakeholder.isCompany) {
      return stakeholder
    }
    stakeholder.credits =
     stakeholdersTotelCredits / (xfactor / stakeholder.groupXFactor)
    stakeholder.weightValue = stakeholder.credits / TotelCredits
    return stakeholder
  })
}

const stakeholdersResult = (stakeholders, coreSubject) => {
  return sum(stakeholders.map(stakeholder => {
    if (stakeholder.isCompany) {
      return 0
    }
    const record = find(stakeholder.coreSubjects, {coreSubject: coreSubject})

    if (record) {
      return (record.relevanceValue * stakeholder.credits) / stakeholdersTotelCredits
    } else {
      return 0
    }

  }))
}
/*
OLD Calculation formula
const companyResult = (stakeholders, coreSubject) => {
  return sum(stakeholders.map(stakeholder => {
    if (stakeholder.isCompany) {
      const record = find(stakeholder.coreSubjects, {coreSubject: coreSubject})

      if (record) {
        return (record.relevanceValue * stakeholder.credits) / stakeholdersTotelCredits
      } else {
        return 0
      }
    }
    return 0
  }))
}*/

const companyResult = (stakeholders, coreSubject) => {
  let companyStakeholders = 0
  const result = sum(stakeholders.map(stakeholder => {
    if (stakeholder.isCompany) {
      const record = find(stakeholder.coreSubjects, {coreSubject: coreSubject})

      if (record) {
        companyStakeholders++
        return (record.relevanceValue * stakeholder.credits) / stakeholdersTotelCredits
      } else {
        return 0
      }
    }
    return 0
  }))

  return companyStakeholders === 0 ? 0 : result / companyStakeholders
}


const updateCoreSubjectsRating = (stakeholder, data) => {
  data.map(item => {
    const record = find(stakeholder.coreSubjects, {coreSubject: item.coreSubject})
    if (record) {
      record.rating = item.rating
      record.relevanceValue = relevanceValueByRating(7, item.rating)
    } else {
      item.relevanceValue = relevanceValueByRating(7, item.rating)
      const coreSubject = {...item}
      stakeholder.coreSubjects = [...stakeholder.coreSubjects || [], coreSubject]
    }
  })

  return stakeholder
}

const updateIssueOfInterestRating = (stakeholder, coreSubject, data) => {
  const currentCoreSubject = find(stakeholder.coreSubjects, {coreSubject: coreSubject})
  const issueOfInterestTotal = data.length
  if (!currentCoreSubject) {
    throw new Error('Error cant find Core Subject Stakeholder')
  }
  data.map(item => {
    const record = find(currentCoreSubject.issueOfInterests, {issueOfInterest: item.issueOfInterest})
    if (record) {
      record.rating = item.rating
      record.relevanceValue = relevanceValueByRating(issueOfInterestTotal, item.rating)
    } else {
      item.relevanceValue = relevanceValueByRating(issueOfInterestTotal, item.rating)
      const issueOfInterest = {...item}
      currentCoreSubject.issueOfInterests = [...currentCoreSubject.issueOfInterests || [], issueOfInterest]
    }
  })

  return stakeholder
}

const updateEmployeeCoreSubjectsRating = (employee, data) => {
  data.map(item => {
    const record = find(employee.coreSubjects, {coreSubject: item.coreSubject})
    if (record) {
      record.rating = item.rating
      record.relevanceValue = relevanceValueByRating(7, item.rating)
    } else {
      item.relevanceValue = relevanceValueByRating(7, item.rating)
      const coreSubject = {...item}
      employee.coreSubjects = [...employee.coreSubjects || [], coreSubject]
    }
  })

  return employee
}

const updateEmployeeIssueOfInterestRating = (employee, coreSubject, data) => {
  const currentCoreSubject = find(employee.coreSubjects, {coreSubject: coreSubject})
  const issueOfInterestTotal = data.length
  if (!currentCoreSubject) {
    throw new Error('Error cant find Core Subject Employee')
  }
  data.map(item => {
    const record = find(currentCoreSubject.issueOfInterests, {issueOfInterest: item.issueOfInterest})
    if (record) {
      record.rating = item.rating
      record.relevanceValue = relevanceValueByRating(issueOfInterestTotal, item.rating)
    } else {
      item.relevanceValue = relevanceValueByRating(issueOfInterestTotal, item.rating)
      const issueOfInterest = {...item}
      currentCoreSubject.issueOfInterests = [...currentCoreSubject.issueOfInterests || [], issueOfInterest]
    }
  })

  return employee
}

const updateCoreSubjectsEmployees = (materiality, data) => {
  data.map(item => {
    const record = find(materiality.coreSubjects, {coreSubject: item.coreSubject})
    if (record) {
      record.relevanceEmployeesValue = stakeholdersResult(materiality.employees, item.coreSubject)
      //record.relevanceCompanyValue = companyResult(materiality.employees, item.coreSubject)
      //record.weightValue = (record.relevanceEmployeesValue + record.relevanceCompanyValue) / 2
    } else {
      const relevanceEmployeesValue = stakeholdersResult(materiality.employees, item.coreSubject)
      //const relevanceCompanyValue = companyResult(materiality.employees, item.coreSubject)
      const coreSubject = {
        coreSubject: item.coreSubject,
        relevanceEmployeesValue: relevanceEmployeesValue,
        //relevanceCompanyValue: relevanceCompanyValue,
        //weightValue: (relevanceCompanyValue + relevanceCompanyValue) / 2,
      }
      materiality.coreSubjects = [...materiality.coreSubjects, coreSubject]
    }
  })
  return materiality.coreSubjects
}

const updateEmployeeCoreSubjectsMateriality = (materiality, coreSubject, data) => {
  const currentCoreSubject = find(materiality.coreSubjects, {coreSubject: coreSubject})
  if (!currentCoreSubject) {
    throw new Error('Error cant find Core Subject mater')
  }
  data.map(item => {
    const record = find(currentCoreSubject.issueOfInterests, {issueOfInterest: item.issueOfInterest})

    if (record) {
      record.relevanceEmployeesValue = stakeholdersIssueOfIenterstResult(
        materiality.employees,
        coreSubject,
        item.issueOfInterest)
    } else {
      const relevanceEmployeesValue = stakeholdersIssueOfIenterstResult(
        materiality.employees,
        coreSubject,
        item.issueOfInterest)
      const issueOfInterest = {
        issueOfInterest: item.issueOfInterest,
        relevanceEmployeesValue: relevanceEmployeesValue,
      }
      currentCoreSubject.issueOfInterests = [...currentCoreSubject.issueOfInterests || [], issueOfInterest]
    }
  })
  return materiality.coreSubjects
}

const updateEmployeesGroup = (updateMateriality, materiality, employeeId, groupXFactor) => {

  if (updateMateriality) {
    const xfactorSum = stakeholdersXfactorSum(updateMateriality.employees)
    materiality.employees = stakeholderCreditAndWeight(updateMateriality.employees, xfactorSum)
  } else {
    const employee = {
      employee: employeeId,
      groupXFactor: groupXFactor,
    }
    materiality.employees = [...materiality.employees || [], employee]
    const xfactorSum = stakeholdersXfactorSum(materiality.employees)
    materiality.employees = stakeholderCreditAndWeight(materiality.employees, xfactorSum)
  }
  return materiality.employees
}


const updateCoreSubjectsStakeholders = (materiality, data) => {
  data.map(item => {
    const record = find(materiality.coreSubjects, {coreSubject: item.coreSubject})
    if (record) {
      record.relevanceStakeholdersValue = stakeholdersResult(materiality.stakeholders, item.coreSubject)
      record.relevanceCompanyValue = companyResult(materiality.stakeholders, item.coreSubject)
      record.weightValue = (record.relevanceStakeholdersValue + record.relevanceCompanyValue) / 2
    } else {
      const relevanceStakeholdersValue = stakeholdersResult(materiality.stakeholders, item.coreSubject)
      const relevanceCompanyValue = companyResult(materiality.stakeholders, item.coreSubject)
      const coreSubject = {
        coreSubject: item.coreSubject,
        relevanceStakeholdersValue: relevanceStakeholdersValue,
        relevanceCompanyValue: relevanceCompanyValue,
        weightValue: (relevanceCompanyValue + relevanceCompanyValue) / 2,
      }
      materiality.coreSubjects = [...materiality.coreSubjects, coreSubject]
    }
  })
  return materiality.coreSubjects
}


const updateStakeholderCoreSubjectsRating = (stakeholder, data) => {
  data.map(item => {
    const record = find(stakeholder.coreSubjects, {coreSubject: item.coreSubject})
    if (record) {
      record.rating = item.rating
      record.relevanceValue = relevanceValueByRating(7, item.rating)
    } else {
      item.relevanceValue = relevanceValueByRating(7, item.rating)
      const coreSubject = {...item}
      stakeholder.coreSubjects = [...stakeholder.coreSubjects || [], coreSubject]
    }
  })

  return stakeholder
}

const updateStakeholdersGroup = (updateMateriality, materiality, stakeholderId, groupXFactor) => {

  if (updateMateriality) {
    const xfactorSum = stakeholdersXfactorSum(updateMateriality.stakeholders)
    materiality.stakeholders = stakeholderCreditAndWeight(updateMateriality.stakeholders, xfactorSum)
  } else {
    const stakeholder = {
      stakeholder: stakeholderId,
      groupXFactor: groupXFactor,
    }
    materiality.stakeholders = [...materiality.stakeholders || [], stakeholder]
    const xfactorSum = stakeholdersXfactorSum(materiality.stakeholders)
    materiality.stakeholders = stakeholderCreditAndWeight(materiality.stakeholders, xfactorSum)
  }
  return materiality.stakeholders
}

//issue of Interests
const stakeholdersIssueOfIenterstResult = (stakeholders, coreSubject, issueOfInterest) => {
  return sum(stakeholders.map(stakeholder => {
    if (stakeholder.isCompany) {
      return 0
    }
    const currentCoreSubject = find(stakeholder.coreSubjects, {coreSubject: coreSubject})

    if (!currentCoreSubject) {
      return 0
    }
    const record = find(currentCoreSubject.issueOfInterests, {issueOfInterest})
    // console.log(record)
    if (record) {
      return (record.relevanceValue * stakeholder.credits) / stakeholdersTotelCredits
    } else {
      return 0
    }

  }))
}
/*
OLD Calculation formula
const companyIssueOfIenterstResult = (stakeholders, coreSubject, issueOfInterest) => {
  return sum(stakeholders.map(stakeholder => {
    if (stakeholder.isCompany) {
      const currentCoreSubject = find(stakeholder.coreSubjects, {coreSubject: coreSubject})

      if (!currentCoreSubject) {
        return 0
      }
      const record = find(currentCoreSubject.issueOfInterests, {issueOfInterest})

      if (record) {

        return (record.relevanceValue * stakeholder.credits) / stakeholdersTotelCredits
      } else {
        return 0
      }
    }
    return 0
  }))
}*/

const companyIssueOfIenterstResult = (stakeholders, coreSubject, issueOfInterest) => {
  let companyStakeholders = 0
  const result = sum(stakeholders.map(stakeholder => {
    if (stakeholder.isCompany) {
      const currentCoreSubject = find(stakeholder.coreSubjects, {coreSubject: coreSubject})

      if (!currentCoreSubject) {
        return 0
      }
      const record = find(currentCoreSubject.issueOfInterests, {issueOfInterest})

      if (record) {
        companyStakeholders++
        return (record.relevanceValue * stakeholder.credits) / stakeholdersTotelCredits
      } else {
        return 0
      }
    }
    return 0
  }))

  return companyStakeholders === 0 ? 0 : result / companyStakeholders
}

const updateStakeholderIssueOfInertestRating = (stakeholder, coreSubject, data) => {
  const currentCoreSubject = find(stakeholder.coreSubjects, {coreSubject: coreSubject})
  const issueOfInterstTotal = data.length
  if (!currentCoreSubject) {
    throw new Error('Error cant find Core Subject Stakeholder')
  }
  data.map(item => {
    const record = find(currentCoreSubject.issueOfInterests, {issueOfInterest: item.issueOfInterest})
    if (record) {
      record.rating = item.rating
      record.relevanceValue = relevanceValueByRating(issueOfInterstTotal, item.rating)
    } else {
      item.relevanceValue = relevanceValueByRating(issueOfInterstTotal, item.rating)
      const issueOfInterest = {...item}
      currentCoreSubject.issueOfInterests = [...currentCoreSubject.issueOfInterests || [], issueOfInterest]
    }
  })

  return stakeholder
}

const updateCoreSubjectsMateriality = (materiality, coreSubject, data) => {
  const currentCoreSubject = find(materiality.coreSubjects, {coreSubject: coreSubject})
  if (!currentCoreSubject) {
    throw new Error('Error cant find Core Subject mater')
  }
  data.map(item => {
    const record = find(currentCoreSubject.issueOfInterests, {issueOfInterest: item.issueOfInterest})

    if (record) {
      record.relevanceStakeholdersValue = stakeholdersIssueOfIenterstResult(
        materiality.stakeholders,
        coreSubject,
        item.issueOfInterest)

      record.relevanceCompanyValue = companyIssueOfIenterstResult(materiality.stakeholders,
        coreSubject,
        item.issueOfInterest)
      record.weightValue = (record.relevanceStakeholdersValue + record.relevanceCompanyValue) / 2
    } else {
      const relevanceStakeholdersValue = stakeholdersIssueOfIenterstResult(
        materiality.stakeholders,
        coreSubject,
        item.issueOfInterest)
      const relevanceCompanyValue = companyIssueOfIenterstResult(materiality.stakeholders,
        coreSubject,
        item.issueOfInterest)
      const issueOfInterest = {
        issueOfInterest: item.issueOfInterest,
        relevanceStakeholdersValue: relevanceStakeholdersValue,
        relevanceCompanyValue: relevanceCompanyValue,
        weightValue: (relevanceCompanyValue + relevanceCompanyValue) / 2,
      }
      currentCoreSubject.issueOfInterests = [...currentCoreSubject.issueOfInterests || [], issueOfInterest]
    }
  })
  return materiality.coreSubjects
}

module.exports = {
  updateStakeholderCoreSubjectsRating,
  updateStakeholdersGroup,
  updateCoreSubjectsStakeholders,
  updateStakeholderIssueOfInertestRating,
  updateCoreSubjectsMateriality,

  updateEmployeeCoreSubjectsRating,
  updateEmployeesGroup,
  updateCoreSubjectsEmployees,
  updateEmployeeIssueOfInterestRating,
  updateEmployeeCoreSubjectsMateriality,

  updateCoreSubjectsRating,
  updateIssueOfInterestRating,
}

