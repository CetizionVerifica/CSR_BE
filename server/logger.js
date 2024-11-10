const winston = require('winston')
const config = require('./config/keys')
const buildLoggerConfig = require('./helpers/buildLoggerConfig')

module.exports = winston.createLogger(buildLoggerConfig(config.logger))
