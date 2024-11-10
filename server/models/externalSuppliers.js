const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ExternalSupplierRequestSchema = new Schema({
  assesmentPlatformMethod: {
    type: String,
  },  
  assesmentResult: {
    type: String,
  },  
  engagementStatus: {
    type: String,
  },   
  compliance: {
    type: String,
    default: 'Noncompliant',
    enum : ['Pending','Compliant', 'Noncompliant'],
  },
  name: {
    type: String,
  },   
  phone: {
    type: String,
  },   
  supplierCategory: {
    type: String,
  },  
  supplierCategoryCoverage: {
    type: String,
  },     
  supplierEmail: {
    type: String,
    trim: true,
    required: true,
  },
  date: {
    type: Date,
    // required: true,
  },  
  supplierName: {
    type: String,
    required: true,
  },
  companyID: {
    type: Schema.Types.ObjectId,
    ref: 'company',
    required: true,
  },
  isHighConcern: {
    type: Boolean,
    default: false,
    required: true,
  },  
})

const ModelClass = mongoose.model('externalSupplier', ExternalSupplierRequestSchema)

module.exports = ModelClass
