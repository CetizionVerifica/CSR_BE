const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const PartnerSchema = new Schema({
  agency: {
    type: Schema.Types.ObjectId,
    ref: "agency",
  },
  company: {
    type: Schema.Types.ObjectId,
    ref: "company",
  },
  sharedProjects: [
    {
      type: Schema.Types.ObjectId,
      ref: "project",
    },
  ],
  showProjectResults: [
    {
      type: Schema.Types.ObjectId,
      ref: "project",
    },
  ],
  requestedYears: [
    {
      type: Number,
    },
  ],
  partnerRequestedProjects: [
    {
      type: Schema.Types.ObjectId,
      ref: "project",
    },
  ],
});

const AgencySchema = new Schema({
  email: {
    type: String,
    lowercase: true,
    trim: true,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  reseller: {
    type: Schema.Types.ObjectId,
    ref: "user",
  },
  descriptions: {
    type: String,
  },
  phone: {
    type: String,
  },
  country: {
    type: String,
  },
  website: {
    type: String,
  },
  industry: {
    type: String,
  },
  active: {
    type: Boolean,
    default: true,
  },
  logo: {
    type: String,
  },
  companies: [
    {
      type: Schema.Types.ObjectId,
      ref: "company",
    },
  ],
  // The related companies with supplier request
  partners: [PartnerSchema],
  // supplierCompanies: [{
  //   type: Schema.Types.ObjectId,
  //   ref: 'company',
  // }],
  projects: [
    {
      type: Schema.Types.ObjectId,
      ref: "project",
    },
  ],
  users: [
    {
      type: Schema.Types.ObjectId,
      ref: "user",
    },
  ],
  //users: [UsersSchema],
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "user",
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: "user",
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

AgencySchema.statics.findProjects = function (id) {
  return this.findById(id)
    .populate("projects")
    .then((agency) => agency.projects);
};

AgencySchema.statics.findCompanies = function (id) {
  return this.findById(id)
    .populate("companies")
    .then((agency) => agency.companies);
};

AgencySchema.statics.findUsers = function (id) {
  return this.findById(id)
    .populate("users")
    .then((agency) => {
      return agency.users;
    });
};

AgencySchema.statics.findAgencyPartners = function (agencyId) {
  return this.findById(agencyId)
    .populate("partners.company")
    .populate("partners.sharedProjects")
    .populate("partners.showProjectResults")
    .then((agency) => agency);
};

const ModelClass = mongoose.model("agency", AgencySchema);

module.exports = ModelClass;
