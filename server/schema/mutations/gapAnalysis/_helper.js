const { find, sumBy, size } = require('lodash')
const { absValue } = require('../../../helpers/utils')

const keyConsiderationsWeight = (keyConsiderations) => {
  return keyConsiderations.map(key => {

    key.revisedPerformanceValue =  0

    if(key.revisedScore >=0.2 && key.revisedScore <0.4)
    {
      key.revisedPerformanceValue =  1

    }
    if(key.revisedScore >=0.4 && key.revisedScore <0.6)
    {
      key.revisedPerformanceValue =  2

    }
    if(key.revisedScore >=0.6 && key.revisedScore <0.8)
    {
      key.revisedPerformanceValue =  3

    }
    if(key.revisedScore >=0.8  )
    {
      key.revisedPerformanceValue =  4

    }



    key.relevanceWeightValue =    key.relevanceValue / sumBy(keyConsiderations, 'relevanceValue')
    key.WeightValue = (key.actualPerformanceValue / 4) * key.relevanceWeightValue
    //key.issueLevel = (4 - key.actualPerformanceValue) + key.relevanceValue
    key.issueLevel = (4 - key.revisedPerformanceValue) + key.relevanceValue
    return key
  })
}

const issueOfInterestsPerformance = (keyConsiderations) => {
  return sumBy(keyConsiderations, 'WeightValue')
}

const issueOfInterestsRelevance = (keyConsiderations) => {
  return (sumBy(keyConsiderations, 'relevanceValue') / keyConsiderations.length) / 5
}

const issueOfInterestsWeight = (issueOfInterests) => {
  return issueOfInterests.map(issue => {
    issue.relevanceWeightValue =
      issue.relevanceValue / sumBy(issueOfInterests, 'relevanceValue')
    issue.WeightValue = issue.performanceValue * issue.relevanceWeightValue
    return issue
  })
}

const coreSubjectsPerformance = (issueOfInterests) => {
  return sumBy(issueOfInterests, 'WeightValue')
}

const coreSubjectsRelevance = (issueOfInterests) => {
  return (sumBy(issueOfInterests, 'relevanceValue') / issueOfInterests.length)
}

const coreSubjectsKeysSize = (issueOfInterests) => {
  return sumBy(issueOfInterests.map(issue => size(issue.keyConsiderations)))
}
const coreSubjectsWeight = (coreSubjects) => {
  return coreSubjects.map(coreSubject => {
    coreSubject.relevanceWeightValue =
      coreSubject.relevanceValue / sumBy(coreSubjects, 'relevanceValue')
    coreSubject.WeightValue = coreSubject.performanceValue * coreSubject.relevanceWeightValue
    return coreSubject
  })
}

const getKeyConsiderationFile = (gapAnalysis, data) => {
  const coreSubject = find(gapAnalysis.coreSubjects, { coreSubject: data.coreSubject })

  if (!coreSubject) {
    return null
  }

  const issueOfInterest = find(coreSubject.issueOfInterests, { issueOfInterest: data.issueOfInterest })

  if (!issueOfInterest) {
    return null
  }

  const keyConsideration = find(issueOfInterest.keyConsiderations, { keyConsideration: data.keyConsideration })

  if (!keyConsideration) {
    return null
  }

  return keyConsideration.file
}

const getKeyConsideration = (issueOfInterest, data) => {
  const record = find(issueOfInterest.keyConsiderations, { keyConsideration: data.keyConsideration })
  if (record) {
    if (data.performanceValue !== undefined) {
      record.performanceValue = data.performanceValue
      if (data.customField) {
        record.customField = data.customField
      }
      if (data.extraCustomField) {
        record.extraCustomField = data.extraCustomField
      }
      record.actualPerformanceValue = absValue(4, data.performanceValue) 
     
      keyConsiderationsWeight(issueOfInterest.keyConsiderations)
    }
    if (data.noDocument !== undefined) {
      record.noDocument = data.noDocument
      record.file = data.noDocument ? null : record.file
    }
    if (data.noRelatedDocument !== undefined) {
      record.noRelatedDocument = data.noRelatedDocument
      record.file = data.noRelatedDocument ? null : record.file
    }
    if (data.file) {
      record.file = data.file
      record.noDocument = false
      record.noRelatedDocument = false
    }
    if (data.relevanceValue !== undefined) {
      record.relevanceValue = data.relevanceValue
      if (data.relevanceValue === 0) {
        record.performanceValue = 0
        record.actualPerformanceValue = 0
        record.revisedPerformanceValue=0
        record.relevanceWeightValue = 0
        record.WeightValue = 0
        record.issueLevel = undefined
        record.file = null
        record.noRelatedDocument = false
      }
      keyConsiderationsWeight(issueOfInterest.keyConsiderations)
    }
    if (data.note) {
      record.note = data.note
    }
    return issueOfInterest.keyConsiderations
  } else {
    const keyConsideration = {
      keyConsideration: data.keyConsideration,
      performanceValue: data.performanceValue,
      actualPerformanceValue: absValue(4, data.performanceValue),
      relevanceValue: data.relevanceValue,
      issueLevel: data.relevanceValue !== undefined ?
        (4 - absValue(4, data.performanceValue)) + data.relevanceValue : 0,
      note: data.note,
      file: data.file,
      noDocument: data.noDocument,
      noRelatedDocument: data.noRelatedDocument,
    }
    return [...issueOfInterest.keyConsiderations || [], keyConsideration]
  }

}
const getIssueOfInterest = (coreSubject, data) => {
  const record = find(coreSubject.issueOfInterests, { issueOfInterest: data.issueOfInterest })
  if (record) {
    const keyConsiderations = getKeyConsideration(record, data)
    record.keyConsiderations = keyConsiderations
    if (data.customField) {
      record.customField = data.customField
    }
    if (data.extraCustomField) {
      record.extraCustomField = data.extraCustomField
    }

    record.performanceValue = issueOfInterestsPerformance(keyConsiderations)
    record.relevanceValue = issueOfInterestsRelevance(keyConsiderations)
    issueOfInterestsWeight(coreSubject.issueOfInterests)
    return coreSubject.issueOfInterests
  } else {
    const keyConsiderations = getKeyConsideration([], data)

    const issueOfInterest = {
      issueOfInterest: data.issueOfInterest,
      keyConsiderations: keyConsiderations,
    }
    return [...coreSubject.issueOfInterests || [], issueOfInterest]
  }
}

const updateCoreSubjects = (gapAnalysis, data) => {
  //console.log(data)
  const record = find(gapAnalysis.coreSubjects, { coreSubject: data.coreSubject })
  if (record) {
    const issueOfInterests = getIssueOfInterest(record, data)
    record.issueOfInterests = issueOfInterests
    record.performanceValue = coreSubjectsPerformance(issueOfInterests)
    record.relevanceValue = coreSubjectsRelevance(issueOfInterests)
    record.totalKeyConsiderations = coreSubjectsKeysSize(issueOfInterests)
    coreSubjectsWeight(gapAnalysis.coreSubjects)
    return gapAnalysis.coreSubjects
  } else {
    const issueOfInterest = getIssueOfInterest([], data)

    const coreSubject = {
      coreSubject: data.coreSubject,
      issueOfInterests: issueOfInterest,
      totalKeyConsiderations: 0,
    }
    return [...gapAnalysis.coreSubjects, coreSubject]
  }
}

const updateKeyConsiderationRevisingScore = (gapAnalysis, revisingScores) => {



  if (gapAnalysis.coreSubjects) {

    revisingScores.forEach(revisingScore => {
      const kc = revisingScore.keyConsideration
      const record = find(gapAnalysis.coreSubjects, { issueOfInterests: [{ keyConsiderations: [{ keyConsideration: kc }] }] })

      if (record) {
        const issueOfInterest = find(record.issueOfInterests, { keyConsiderations: [{ keyConsideration: kc }] })

        const keyConsideration = find(issueOfInterest.keyConsiderations, { keyConsideration: kc })
        keyConsideration.revisingScore = revisingScore.score / 100

      }
    })

    gapAnalysis.coreSubjects.forEach(coreSubject => {
      var currentsubject = coreSubject;
      currentsubject.revisedScore = 0
      coreSubject.issueOfInterests.forEach(issue => {
        var currentissue = issue;
        currentissue.revisedScore = 0
        issue.keyConsiderations.forEach(keyConsideration => {

          // If no documentation is related the revising score is capped at 25%
          let multiplier = keyConsideration.noRelatedDocument ? 0.25 : keyConsideration.revisingScore

          // If there is no documentation needed the score has no penalty
          if (keyConsideration.noDocument) {
            multiplier = 1
          }
          //TODO Check if this needs to be 0.25
          //          keyConsideration.revisedScore = multiplier * (0.25 *  keyConsideration.actualPerformanceValue)

          keyConsideration.revisedScore = multiplier * (0.25 *  keyConsideration.actualPerformanceValue)

          keyConsideration.revisedWeightValue = keyConsideration.revisedScore * keyConsideration.relevanceWeightValue
          currentissue.revisedScore += keyConsideration.revisedWeightValue



        })
        currentissue.revisedWeightValue = currentissue.revisedScore * currentissue.relevanceWeightValue
        currentsubject.revisedScore += currentissue.revisedWeightValue
        keyConsiderationsWeight(issue.keyConsiderations)


      })
      currentsubject.revisedWeightValue = currentsubject.revisedScore * currentsubject.relevanceWeightValue



    })
  }

  return gapAnalysis.coreSubjects

}

module.exports = {
  updateCoreSubjects,
  getIssueOfInterest,
  getKeyConsideration,
  getKeyConsiderationFile,
  updateKeyConsiderationRevisingScore,
}
