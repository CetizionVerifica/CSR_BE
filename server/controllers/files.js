// const GapFile = require('../models/gapFile')

const fs = require('fs')
const {Response} = require('../helpers/response');
const {searchQuery} = require('../schema/queryPagination');
const GapFile = require('../models/gapFile');
exports.uploadFile = function(req, res, next) {

  const file = req.file

  if (file === undefined) {

    throw new Error('no file provided')
  }

  /**
   * Create new record in mongoDB
   */
  const document = {
    project: req.params.projectId,
    name: file.originalname,
    path: file.path,
    uploadedBy: req.user.id,
  }
  const gapFile = new GapFile(document)
  gapFile.save().then((gapFile) => {
    //respond to request indicating the request was sent
    res.json({message: 'File uploaded', fileId: gapFile.id})
  })

  gapFile.save((error) => {
    if (error) {
      return next(error)
    }
    //respond to request indicating the request was sent
    res.json({message: 'File uploaded', fileId: gapFile.id})
  })
}

exports.deleteFile = async function(req, res, next) {

  const gapFile = await GapFile.findById(req.params.fileId)

  if (!gapFile) {
    throw new Error('no file provided')
  }

  fs.unlink(gapFile.path, (err) => {
    if (err) throw err

    GapFile.findByIdAndRemove(req.params.fileId, (e) => {
      if (e) throw e
      //respond to request indicating the request was sent
      res.json({message: 'File deleted'})
    })
  })
}
