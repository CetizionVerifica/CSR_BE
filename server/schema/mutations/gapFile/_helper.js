const {find} = require('lodash')

const updateCriteria = (gapFile, data) => {
  const record = find(gapFile.criteria, {name: data.name})
  if (record) {
    record.value = data.value

    return gapFile.criteria
  } else {
    const criterion = {
      name: data.name,
      value: data.value,
    }
    return [...gapFile.criteria, criterion]
  }
}


module.exports = {
  updateCriteria,
}
