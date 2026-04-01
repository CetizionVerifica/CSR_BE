const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { Response } = require("../helpers/response");
const { searchQuery } = require("../schema/queryPagination");
const GapFile = require("../models/gapFile");

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

exports.uploadFile = function (req, res, next) {
  const file = req.file;

  if (file === undefined) {
    return res.status(400).json({ error: "No file provided" });
  }

  const document = {
    project: req.params.projectId,
    name: file.originalname,
    path: file.key,
    uploadedBy: req.user.id,
  };
  const gapFile = new GapFile(document);
  gapFile
    .save()
    .then((gapFile) => {
      res.json({ message: "File uploaded", fileId: gapFile.id });
    })
    .catch((error) => {
      console.error("Error saving file record:", error);
      return res.status(500).json({ error: "Error uploading file" });
    });
};

exports.deleteFile = async function (req, res, next) {
  try {
    const gapFile = await GapFile.findById(req.params.fileId);

    if (!gapFile) {
      return res.status(404).json({ error: "File not found in database" });
    }

    try {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: gapFile.path,
        })
      );
    } catch (s3Err) {
      console.error("Error deleting file from S3 (continuing with DB cleanup):", s3Err);
    }

    await GapFile.findByIdAndDelete(req.params.fileId);
    res.json({ message: "File deleted successfully" });
  } catch (error) {
    console.error("Unexpected error in deleteFile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
