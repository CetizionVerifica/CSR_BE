const coreSubjects = [{
  value: 'organizationalGovernance',
  text: 'Organisational Governance',
},
{
  value: 'humanRights',
  text: 'Human Rights',
},
{
  value: 'laborPractices',
  text: 'Labour Practices',
},
{
  value: 'theEnvironment',
  text: 'Environment',
},
{
  value: 'fairOperatingPractices',
  text: 'Fair Operating Practices',
},
{
  value: 'consumerIssues',
  text: 'Consumer Issues',
},
{
  value: 'communityInvolvementAndDevelopment',
  text: 'Community Involvement And Development',
},
]

const issueOfInterests = [
  {
    value: 'ethicalConduct',
    text: 'Ethical Conduct',
    coreSubject: 'organizationalGovernance',
  },
  {
    value: 'transparency',
    text: 'Transparency',
    coreSubject: 'organizationalGovernance',
  },
  {
    value: 'respectOfRuleOfLaw',
    text: 'Respect Of Rule Of Law',
    coreSubject: 'organizationalGovernance',
  },
  {
    value: 'accountability',
    text: 'Accountability',
    coreSubject: 'organizationalGovernance',
  },
  {
    value: 'corporateGovernance',
    text: 'Corporate Governance',
    coreSubject: 'organizationalGovernance',
  },
  /* Human Rights */
  {
    value: 'dueDiligence',
    text: 'Due Diligence',
    coreSubject: 'humanRights',
  },
  {
    value: 'humanRightsRisksSituations',
    text: 'Human Rights Risk Situations',
    coreSubject: 'humanRights',
  },
  {
    value: 'avoindanceOfComplicity',
    text: 'Avoidance Of Complicity',
    coreSubject: 'humanRights',
  },
  {
    value: 'resolvingGievances',
    text: 'Resolving Grievances',
    coreSubject: 'humanRights',
  },
  {
    value: 'discriminationAndVulnerableGroups',
    text: 'Discrimination And Vulnerable Groups',
    coreSubject: 'humanRights',
  },
  {
    value: 'civilAndPoliticalRights',
    text: 'Civil And Political Rights',
    coreSubject: 'humanRights',
  },
  {
    value: 'economicSocialAndCulturalRights',
    text: 'Economic, Social And Cultural Rights',
    coreSubject: 'humanRights',
  },
  {
    value: 'fundamentalPrinciplesAndRightsAtWork',
    text: 'Fundamental Principles And Rights At Work',
    coreSubject: 'humanRights',
  },
  /* Labour Practices */
  {
    value: 'employmentAndEmploymentRelationships',
    text: 'Employment And Employment Relationships',
    coreSubject: 'laborPractices',
  },
  {
    value: 'conditionsOfWorkAndSocialProtection',
    text: 'Conditions Of Work And Social Protection',
    coreSubject: 'laborPractices',
  },
  {
    value: 'socialDialogue',
    text: 'Social Dialogue',
    coreSubject: 'laborPractices',
  },
  {
    value: 'healthAndSafetyAtWork',
    text: 'Health And Safety At Work',
    coreSubject: 'laborPractices',
  },
  {
    value: 'humanDevelopmentAndTrainingInTheWorkplace',
    text: 'Human Development And Training In The Workplace',
    coreSubject: 'laborPractices',
  },
  /* The Environment */
  {
    value: 'preventionOfPollution',
    text: 'Prevention Of Pollution',
    coreSubject: 'theEnvironment',
  },
  {
    value: 'sustainableResourceUse',
    text: 'Sustainable Resource Use',
    coreSubject: 'theEnvironment',
  },
  {
    value: 'climateChangeMitigationAndAdaptation',
    text: 'Climate Change Mitigation And Adaptation',
    coreSubject: 'theEnvironment',
  },
  {
    value: 'ProtectionOfTheEnvironmentBiodiversityAndRestorationOfNaturalHabitats',
    text: 'Protection Of The Environment, Biodiversity And Restoration Of Natural Habitats',
    coreSubject: 'theEnvironment',
  },
  /* Fair Operating Practices */
  {
    value: 'antiCorruption',
    text: 'Anti-corruption',
    coreSubject: 'fairOperatingPractices',
  },
  {
    value: 'responsiblePoliticalInvolvement',
    text: 'Responsible Political Involvement',
    coreSubject: 'fairOperatingPractices',
  },
  {
    value: 'fairCompetition',
    text: 'Fair Competition',
    coreSubject: 'fairOperatingPractices',
  },
  {
    value: 'promotingSocialResponsibilityInTheValueChain',
    text: 'Promoting Social Responsibility In The Value Chain',
    coreSubject: 'fairOperatingPractices',
  },
  {
    value: 'respectForPropertyRights',
    text: 'Respect For Property Rights',
    coreSubject: 'fairOperatingPractices',
  },
  /* Consumer Issues */
  {
    value: 'fairMarketingFactualAndUnbiasedInformati',
    text: 'Fair Marketing, Factual And Unbiased Information And Fair Contractual Practices',
    coreSubject: 'consumerIssues',
  },
  {
    value: 'protectingConsumersHealthAndSafety',
    text: 'Protecting Consumers Health And Safety',
    coreSubject: 'consumerIssues',
  },
  {
    value: 'sustainableConsumption',
    text: 'Sustainable Consumption',
    coreSubject: 'consumerIssues',
  },
  {
    value: 'consumerServiceSupportAndComplai',
    text: 'Consumer Service, Support, And Complaint And Dispute Resolution',
    coreSubject: 'consumerIssues',
  },
  {
    value: 'consumerDataProtectionAndPrivacy',
    text: 'Consumer Data Protection And Privacy',
    coreSubject: 'consumerIssues',
  },
  {
    value: 'accessToEssentialServices',
    text: 'Access To Essential Services',
    coreSubject: 'consumerIssues',
  },
  {
    value: 'educationAndAwareness',
    text: 'Education And Awareness',
    coreSubject: 'consumerIssues',
  },
  /* Community Involvement and Development */
  {
    value: 'communityInvolvement',
    text: 'Community Involvement',
    coreSubject: 'communityInvolvementAndDevelopment',
  },
  {
    value: 'educationAndCulture',
    text: 'Education And Culture',
    coreSubject: 'communityInvolvementAndDevelopment',
  },
  {
    value: 'employmentCreationAndSkillsDevelopment',
    text: 'Employment Creation And Skills Development',
    coreSubject: 'communityInvolvementAndDevelopment',
  },
  {
    value: 'technologyDevelopmentAndAccess',
    text: 'Technology Development And Access',
    coreSubject: 'communityInvolvementAndDevelopment',
  },
  {
    value: 'wealthAndIncomeCreation',
    text: 'Wealth And Income Creation',
    coreSubject: 'communityInvolvementAndDevelopment',
  },
  {
    value: 'health',
    text: 'Health',
    coreSubject: 'communityInvolvementAndDevelopment',
  },
  {
    value: 'socialInvestment',
    text: 'Social Investment',
    coreSubject: 'communityInvolvementAndDevelopment',
  },
]

module.exports = {
  coreSubjects,
  issueOfInterests,
}
