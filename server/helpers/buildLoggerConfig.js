const winston = require('winston')
const {forEach, isFunction} = require('lodash')

module.exports = function buildLoggerConfig(config) {
  const loggerConfig = Object.assign({}, config)
  loggerConfig.transports = []
  forEach(config.transports, (transport, key) => {
    if (isFunction(winston.transports[key])) {
      loggerConfig.transports.push(new winston.transports[key](transport))
    }
  })
  return loggerConfig
}
