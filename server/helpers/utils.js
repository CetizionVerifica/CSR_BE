
const absValue = (constant, value) => {
  if (isNaN(constant) || isNaN(value)) {
    return 0
  }
  return constant - Math.abs(constant - value)
}

const issuesLevel = (performnce, relevance) => {
  return (4 - performnce) + relevance
}

module.exports = {
  absValue,
  issuesLevel,
}
