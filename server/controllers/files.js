// const GapFile = require('../models/gapFile')

const fs = require("fs");
const { Response } = require("../helpers/response");
const { searchQuery } = require("../schema/queryPagination");
const GapFile = require("../models/gapFile");
exports.uploadFile = function (req, res, next) {
  const file = req.file;

  if (file === undefined) {
    return res.status(400).json({ error: "No file provided" });
  }

  /**
   * Create new record in mongoDB
   */
  const document = {
    project: req.params.projectId,
    name: file.originalname,
    path: file.path,
    uploadedBy: req.user.id,
  };
  const gapFile = new GapFile(document);
  gapFile
    .save()
    .then((gapFile) => {
      //respond to request indicating the request was sent
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

    // Check if file exists before trying to delete it
    fs.access(gapFile.path, fs.constants.F_OK, (err) => {
      if (err) {
        // File doesn't exist, just remove from database

        GapFile.findByIdAndDelete(req.params.fileId)
          .then(() => {
            res.json({ message: "File entry deleted from database" });
          })
          .catch((e) => {
            console.error("Error removing file from database:", e);
            res
              .status(500)
              .json({ error: "Error removing file from database" });
          });
      } else {
        // File exists, proceed with deletion
        fs.unlink(gapFile.path, (unlinkErr) => {
          if (unlinkErr) {
            console.error("Error deleting file from filesystem:", unlinkErr);
            return res
              .status(500)
              .json({ error: "Error deleting file from filesystem" });
          }

          GapFile.findByIdAndDelete(req.params.fileId)
            .then(() => {
              res.json({ message: "File deleted successfully" });
            })
            .catch((e) => {
              console.error("Error removing file from database:", e);
              res
                .status(500)
                .json({ error: "Error removing file from database" });
            });
        });
      }
    });
  } catch (error) {
    console.error("Unexpected error in deleteFile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
