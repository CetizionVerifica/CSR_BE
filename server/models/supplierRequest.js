const mongoose = require('mongoose')
const Schema = mongoose.Schema

const SupplierRequestSchema = new Schema({
  email: {
    type: String,
    lowercase: true,
    trim: true,
    required: true,
  },
  type: {
    type: String,
    enum: ['Supplier', 'Partner'],
    default: 'Supplier',
  },
  company: {
    type: Schema.Types.ObjectId,
    ref: 'company',
  },
  project: {
    type: Schema.Types.ObjectId,
    ref: 'project',
  },
  requestedYear: {
    type: Number,
  },
})

const ModelClass = mongoose.model('supplierRequest', SupplierRequestSchema)

module.exports = ModelClass
