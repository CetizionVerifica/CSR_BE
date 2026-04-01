const multer = require('multer')
const multerS3 = require('multer-s3')
const { S3Client } = require('@aws-sdk/client-s3')
const path = require('path')

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
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

const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_S3_BUCKET,
    key: function(req, file, cb) {
      const filename = new Date().getTime().toString() + path.extname(file.originalname)
      cb(null, `files/${req.params.projectId}/${filename}`)
    },
  }),
  limits: {fileSize: 50000000},
  fileFilter: function(req, file, callback) {
    validateFile(file, callback)
  },
}).single('projectFile')

module.exports = upload
