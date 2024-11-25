const { GraphQLNonNull } = require("graphql");
const jwt = require("jwt-simple");
const nodeMaler = require("../../../services/nodeMaler");
const getProjection = require("../../../helpers/getProjection");
const CompanyInputType = require("../../types/companyInputType");
const CompanyType = require("../../types/companyType");
const CompanyModel = require("../../../models/company");
const UserModel = require("../../../models/user");
const StakeholderModel = require("../../../models/stakeholder");
const AgencyModel = require("../../../models/agency");
const updateItem = require("../_helper/updateItem");
const config = require("../../../config/keys");

const { checkAuth } = require("../../../services/checkAuth");

function tokenForUser(user) {
  const timestamp = new Date().getTime();

  return jwt.encode(
    { sub: user.id, role: user.role, iat: timestamp },
    config.secretJWT
  );
}

module.exports = {
  type: CompanyType,
  args: {
    data: {
      name: "data",
      type: new GraphQLNonNull(CompanyInputType),
    },
  },
  async resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated());
    // update
    const projection = getProjection(options.fieldNodes[0]);

    const comapanyData = Object.assign({}, params.data);

    comapanyData.createdBy = root.user._id;
    comapanyData.updatedBy = root.user._id;
    // comapanyData.agency = root.user.currentAgency
    let users = params.data.users.map((item) => {
      return UserModel.findById(item);
    });
    users = await Promise.all(users);
    comapanyData.users = users;
    comapanyData.reseller = users[0];

    const companyModel = new CompanyModel(comapanyData);
    const company = await companyModel.save();

    if (!company) {
      throw new Error("Error creating company");
    }

    const stakeholderRecord = {
      isCompany: true,
      name: company.name,
      companyName: company.name,
      email: company.personEmail,
      jobPosition: company.jobPosition,
    };
    const stakeholderModel = new StakeholderModel({
      ...stakeholderRecord,
      company,
    });
    const stakeholder = await stakeholderModel.save();

    if (!stakeholder) {
      throw new Error("Error creating stakeholder");
    }

    const { item } = await updateItem({
      id: company.id,
      type: "company",
      changes: { stakeholders: [stakeholder] },
      projection,
      userId: root.user._id,
    });
    // const agency = await AgencyModel.findById(root.user.currentAgency)

    // if (!agency) {
    //   throw new Error('Error cant find agency')
    // }
    // await updateItem({
    //   id: root.user.currentAgency,
    //   type: 'agency',
    //   changes: {companies: [...agency.companies, company]},
    //   projection,
    //   userId: root.user._id,
    // })
    const person = await UserModel.findOne({ email: comapanyData.personEmail });
    if (!person) {
      // sign up new user
      //NV : NEED to create a new Agency and assign it to user
      const user = new UserModel({
        email: comapanyData.personEmail,
        // password: 'defaultpassword',
        name: comapanyData.personName,
        jobPosition: comapanyData.jobPosition,
        phone: comapanyData.phone,
        //currentAgency : NEW agency
        //agencies : [ ADD the new Agency ]
        active: true,
        password: comapanyData.password,
      });
      // create new agency by person infromation
      const agency = new AgencyModel({
        email: company.email,
        name: company.name,
      });
      agency.users = [user];
      agency.companies = [company];
      // agency.reseller = user
      await agency.save();
      // add agency to user
      user.currentAgency = agency;
      user.agencies = [agency];
      // add agency to company
      company.agency = agency;
      await user.save();
      const mailOptions = {
        from: "Resilisense <noreply@resilisense.com>", // sender address
        to: comapanyData.personEmail, // list of receivers
        subject: "New registration", // Subject line
        //text: 'Hello world?', // plain text body

        html: `<p>Dear Sir / Madam,</p>
        <p>You have received this email as a notification about the successful registration of  ${
          comapanyData.name
        } on Resilisense and the creation of your account, following your request.  </p>
        <p>To access your account, please click <a href='https://${
          config.applicationUrl
        }/api/verify-email/${tokenForUser(
          user
        )}/1'>here</a>  and follow the instructions provided. You will be required to change your log-in password to a personal one before gaining full access to your account. </p>
        <p>For technical support regarding accessing your account or any other enquiries regarding  Resilisense please email info@resilisense.com</p>
        <p>Thank you for registering with Resilisense!</p>
        <p>Best regards,</p>
        <p>The Seven Tookit Team</p>`, // html body
      };

      nodeMaler(mailOptions).catch(console.error);
    } else {
      company.agency = person.currentAgency;
      // Adding company to existing agency
      const agency = await AgencyModel.findById(person.currentAgency);
      agency.companies = [...agency.companies, company];
      await agency.save();
      const mailOptions = {
        from: "Resilisense<noreply@resilisense.com>", // sender address
        to: person.email, // list of receivers
        subject: "Existing Account notification", // Subject line
        //text: 'Hello world?', // plain text body
        html: `
        <p>Dear Sir / Madam,</p>
        <p>An account under the same email address ${person.email} already exists. </p>
        <p>Please click here to login to your account. <a href='https://${config.applicationUrl}'>here</a>     </p>
        <p>For technical support regarding accessing your account or any other enquiries regarding Resilisense please email info@seven-toolkit.com. </p>
        <p>Thank you for choosing the Resilisense!</p>
        <p> Best regards,</p>
        <p> The Seven Tookit Team</p>
       
        `, // html body
      };
      nodeMaler(mailOptions).catch(console.error);
    }

    await company.save();

    return item;
  },
};
