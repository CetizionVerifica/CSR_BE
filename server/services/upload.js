const multer = require('multer')
const path = require('path')
const fs = require('fs')

/** Storage Engine */
const storageEngine = multer.diskStorage({
  destination: function(req, file, cb) {
    const destination = `./public/files/${req.params.projectId}`

    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, {recursive: true})
    }

    cb(null, destination)
  },
  filename: function(req, file, fn) {
    fn(null, new Date().getTime().toString() + path.extname(file.originalname))
  },
})

const validateFile = function(file, cb) {
  const allowedFileTypes = /pdf|doc|docx|txt/
  const extension = allowedFileTypes.test(path.extname(file.originalname).toLowerCase())
  const mimeType = allowedFileTypes.test(file.mimetype)
  if (extension && mimeType) {
    return cb(null, true)
  } else {
    cb('Invalid file type. Only PDF, DOC, DOCX and TXT file are allowed.')
  }
}

//init
const upload = multer({
  storage: storageEngine,
  // file size 50MB
  limits: {fileSize: 50000000},
  fileFilter: function(req, file, callback) {
    validateFile(file, callback)
  },
}).single('projectFile')

module.exports = upload
