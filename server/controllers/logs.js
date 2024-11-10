const LogsModel = require('./../models/logs');

exports.fetchLogs = async (req, res) => {
   const result = await LogsModel.find({})
   res.json({data: result});
}
