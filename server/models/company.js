const mongoose = require('mongoose')
const ObjectId = mongoose.Types.ObjectId
const Schema = mongoose.Schema
const AgencyModel = require('./agency')

const userCompanySchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'user',
  },
  permission: {
    type: String,
    required: true,
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'user',
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'user',
  },
  projects: [{
    type: Schema.Types.ObjectId,
    ref: 'project',
  }],
  date: {
    type: Date,
    default: Date.now,
  },
  updatedDate: {
    type: Date,
    default: Date.now,
  },

})

const SupplierSchema = new Schema({
  agency: {
    type: Schema.Types.ObjectId,
    ref: 'agency',
  },
  projects: [{
    type: Schema.Types.ObjectId,
    ref: 'project',
  }],
})

const CompanySchema = new Schema({
  agency: {
    type: Schema.Types.ObjectId,
    ref: 'agency',
  },
  // Are the accepted suppliers of the company
  suppliers: [SupplierSchema],
  // The related companies with supplier request
  // partners: [PartnerSchema],
  // partnerAgency: [{
  //   type: Schema.Types.ObjectId,
  //   ref: 'agency',
  // }],
  name: {
    type: String,
    required: true,
  },
  lisence: {
    type: Array,
    default: ['gap'],
  },
  email: {
    type: String,
  },
  website: {
    type: String,
  },
  country: {
    type: String,
  },
  sector: {
    type: String,
  },
  type: {
    type: String,
  },
  serviceProductInfo: {
    type: String,
  },
  percentageServiceProduct: {
    type: String,
  },
  phone: {
    type: String,
  },
  fax: {
    type: String,
  },
  personName: {
    type: String,
    required: true,
  },
  jobPosition: {
    type: String,
    required: true,
  },
  personEmail: {
    type: String,
    required: true,
  },
  personPhone: {
    type: String,
  },
  personExtetion: {
    type: String,
  },
  personFax: {
    type: String,
  },
  actionAndKPIs: [{
    type: Schema.Types.ObjectId,
    ref: 'actionAndKPIs',
  }],
  users: [{
    type: Schema.Types.ObjectId,
    ref: 'user',
  }],
  reseller: {
    type: Schema.Types.ObjectId,
    ref: 'user',
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'user',
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'user',
  },
  projects: [{
    type: Schema.Types.ObjectId,
    ref: 'project',
  }],
  employees: [{
    type: Schema.Types.ObjectId,
    ref: 'employee',
  }],
  stakeholders: [{
    type: Schema.Types.ObjectId,
    ref: 'stakeholder',
  }],
  date: {
    type: Date,
    default: Date.now,
  },
  updatedDate: {
    type: Date,
    default: Date.now,
  },
  internalEmailTemplate: {
    type: String,
  },
  internalReminderEmailTemplate: {
    type: String,
  },
  externalEmailTemplate: {
    type: String,
  },
  externalReminderEmailTemplate: {
    type: String,
  },
  password: {
    type: String,
  },
})


CompanySchema.statics.addProject = function(id, title) {
  const Project = mongoose.model('project')
  const Stakeholder = mongoose.model('stakeholder')
  return this.findById(id)
    .then(company => {
      const project = new Project({title, company})
      company.projects.push(project)
      return Promise.all([project.save(), company.save()])
        .then(([project, company]) => {
          return Stakeholder.findOne({company: id, isCompany: true})
            .then(stakeholder => Project.addMateriality(project.id, stakeholder.id, {weight: 100}))
            .catch(() => project)

        })
    })
}
//delete
// CompanySchema.statics.addEmployee = function(id, employeeRecord) {
//   const Employee = mongoose.model('employee')
//   return this.findById(id)
//     .then(company => {
//       const employee = new Employee({...employeeRecord, company})
//       company.employees.push(employee)
//       return Promise.all([employee.save(), company.save()])
//         .then(([employee, company]) => company)
//     })
// }

// CompanySchema.statics.addStackholder = function(id, stackholderRecord) {
//   const Stackholder = mongoose.model('stackholder')
//   return this.findById(id)
//     .then(company => {
//       const stackholder = new Stackholder({...stackholderRecord, company})
//       company.stackholders.push(stackholder)
//       return Promise.all([stackholder.save(), company.save()])
//         .then(([stackholder, company]) => company)
//     })
// }

CompanySchema.statics.findProjects = function(id) {
  return this.findById(id)
    .populate('projects')
    .then(company => company.projects)
}

CompanySchema.statics.findEmployees = function(id) {
  return this.findById(id)
    .populate('employees')
    .then(company => company.employees)
}

CompanySchema.statics.findStakeholders = function(id) {

  return this.findById(id)
    .populate('stakeholders')
    .then(company => {
      return company.stakeholders
    })
}

// CompanySchema.statics.findUserProjects = function(id) {
//   return this.findById(id)
//     .populate('projects')
//     .then(company => company.projects)
// }

CompanySchema.statics.findActionsAndKPIs = function(id) {
  return this.findById(id)
    .populate('actionsAndKPIs')
    .then(company => company.actionsAndKPIs)
}

CompanySchema.statics.findAgencySuppliers = function(agencyId) {
  return this.find({agency: new ObjectId(agencyId)})
    .populate('suppliers.agency')
    .populate('suppliers.projects')
    .exec()
    .then(companies => companies)
}

CompanySchema.statics.findProjectSuppliers = function(projectId) {
  return this.find({suppliers: {$elemMatch: {projects: new ObjectId(projectId)}}})
    .exec()
    .then(companies => companies)
}

CompanySchema.pre('remove', async function(next) {
  await AgencyModel
    .findByIdAndUpdate(this.agency, {$pull: {companies: this._id}})
})

const ModelClass = mongoose.model('company', CompanySchema)

module.exports = ModelClass
