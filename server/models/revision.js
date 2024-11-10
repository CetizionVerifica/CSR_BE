const mongoose = require('mongoose')
const Schema = mongoose.Schema

const revisionSchema = new Schema({
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  version: {
    type: Number,
    required: true,
  },
  type: {
    type: String,
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  doc: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
}, {minimize: false})

revisionSchema.index(
  {
    itemId: 1,
    version: 1,
  },
  {unique: true}
)


const ModelClass = mongoose.model('Revision', revisionSchema)

module.exports = ModelClass
