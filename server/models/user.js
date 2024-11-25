const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Schema = mongoose.Schema;

const userSchema = new Schema({
  email: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true,
    required: true,
  },
  agencies: [{
    type: Schema.Types.ObjectId,
    ref: 'agency',
    // unique: true,
  }],
  currentAgency: {
    type: Schema.Types.ObjectId,
    ref: 'agency',
  },
  name: {
    type: String,
    required: true,
  },
  jobPosition: String,
  phone: String,
  extension: String,
  password: String,
  role: {
    type: String,
    default: 'Client',
  },
  lang: String,
  active: {
    type: Boolean,
    default: true,
  },
  image: String,
  date: {
    type: Date,
    default: Date.now,
  },
  companies: [{
    type: Schema.Types.ObjectId,
    ref: 'company',
  }],
  termsAndConditions: {
    type: Boolean,
    default: false,
  },
  lisence: {
    type: Array,
    default: ['gap'],
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
  }

});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

userSchema.methods.compareChangePassword = function (candidatePassword) {
  return bcrypt.compareSync(candidatePassword, this.password);
};

userSchema.statics.findProjects = async function (id) {
  const user = await this.findById(id).populate('projects');
  return user.projects;
};

userSchema.statics.findCompanies = async function (id) {
  const user = await this.findById(id).populate('companies');
  return user.companies;
};

userSchema.statics.findAgencies = async function (id) {
  const user = await this.findById(id).populate('agencies');
  return user.agencies;
};

const ModelClass = mongoose.model('user', userSchema);

module.exports = ModelClass;