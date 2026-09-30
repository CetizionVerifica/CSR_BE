// ISO 26000 core subjects and issues of interest with their legacy keys (historical typos preserved).
// Source: legacy server/services/mappings.js (branch legacy). English labels; translations via M15.

export interface CoreSubjectLabel {
  key: string;
  label: string;
}
export interface IssueLabel {
  key: string;
  label: string;
  coreSubject: string;
}

export const CORE_SUBJECTS: readonly CoreSubjectLabel[] = [
  {
    key: 'organizationalGovernance',
    label: 'Organisational Governance',
  },
  {
    key: 'humanRights',
    label: 'Human Rights',
  },
  {
    key: 'laborPractices',
    label: 'Labour Practices',
  },
  {
    key: 'theEnvironment',
    label: 'Environment',
  },
  {
    key: 'fairOperatingPractices',
    label: 'Fair Operating Practices',
  },
  {
    key: 'consumerIssues',
    label: 'Consumer Issues',
  },
  {
    key: 'communityInvolvementAndDevelopment',
    label: 'Community Involvement And Development',
  },
];

export const ISSUES: readonly IssueLabel[] = [
  {
    key: 'ethicalConduct',
    label: 'Ethical Conduct',
    coreSubject: 'organizationalGovernance',
  },
  {
    key: 'transparency',
    label: 'Transparency',
    coreSubject: 'organizationalGovernance',
  },
  {
    key: 'respectOfRuleOfLaw',
    label: 'Respect Of Rule Of Law',
    coreSubject: 'organizationalGovernance',
  },
  {
    key: 'accountability',
    label: 'Accountability',
    coreSubject: 'organizationalGovernance',
  },
  {
    key: 'corporateGovernance',
    label: 'Corporate Governance',
    coreSubject: 'organizationalGovernance',
  },
  {
    key: 'dueDiligence',
    label: 'Due Diligence',
    coreSubject: 'humanRights',
  },
  {
    key: 'humanRightsRisksSituations',
    label: 'Human Rights Risk Situations',
    coreSubject: 'humanRights',
  },
  {
    key: 'avoindanceOfComplicity',
    label: 'Avoidance Of Complicity',
    coreSubject: 'humanRights',
  },
  {
    key: 'resolvingGievances',
    label: 'Resolving Grievances',
    coreSubject: 'humanRights',
  },
  {
    key: 'discriminationAndVulnerableGroups',
    label: 'Discrimination And Vulnerable Groups',
    coreSubject: 'humanRights',
  },
  {
    key: 'civilAndPoliticalRights',
    label: 'Civil And Political Rights',
    coreSubject: 'humanRights',
  },
  {
    key: 'economicSocialAndCulturalRights',
    label: 'Economic, Social And Cultural Rights',
    coreSubject: 'humanRights',
  },
  {
    key: 'fundamentalPrinciplesAndRightsAtWork',
    label: 'Fundamental Principles And Rights At Work',
    coreSubject: 'humanRights',
  },
  {
    key: 'employmentAndEmploymentRelationships',
    label: 'Employment And Employment Relationships',
    coreSubject: 'laborPractices',
  },
  {
    key: 'conditionsOfWorkAndSocialProtection',
    label: 'Conditions Of Work And Social Protection',
    coreSubject: 'laborPractices',
  },
  {
    key: 'socialDialogue',
    label: 'Social Dialogue',
    coreSubject: 'laborPractices',
  },
  {
    key: 'healthAndSafetyAtWork',
    label: 'Health And Safety At Work',
    coreSubject: 'laborPractices',
  },
  {
    key: 'humanDevelopmentAndTrainingInTheWorkplace',
    label: 'Human Development And Training In The Workplace',
    coreSubject: 'laborPractices',
  },
  {
    key: 'preventionOfPollution',
    label: 'Prevention Of Pollution',
    coreSubject: 'theEnvironment',
  },
  {
    key: 'sustainableResourceUse',
    label: 'Sustainable Resource Use',
    coreSubject: 'theEnvironment',
  },
  {
    key: 'climateChangeMitigationAndAdaptation',
    label: 'Climate Change Mitigation And Adaptation',
    coreSubject: 'theEnvironment',
  },
  {
    key: 'ProtectionOfTheEnvironmentBiodiversityAndRestorationOfNaturalHabitats',
    label: 'Protection Of The Environment, Biodiversity And Restoration Of Natural Habitats',
    coreSubject: 'theEnvironment',
  },
  {
    key: 'antiCorruption',
    label: 'Anti-corruption',
    coreSubject: 'fairOperatingPractices',
  },
  {
    key: 'responsiblePoliticalInvolvement',
    label: 'Responsible Political Involvement',
    coreSubject: 'fairOperatingPractices',
  },
  {
    key: 'fairCompetition',
    label: 'Fair Competition',
    coreSubject: 'fairOperatingPractices',
  },
  {
    key: 'promotingSocialResponsibilityInTheValueChain',
    label: 'Promoting Social Responsibility In The Value Chain',
    coreSubject: 'fairOperatingPractices',
  },
  {
    key: 'respectForPropertyRights',
    label: 'Respect For Property Rights',
    coreSubject: 'fairOperatingPractices',
  },
  {
    key: 'fairMarketingFactualAndUnbiasedInformati',
    label: 'Fair Marketing, Factual And Unbiased Information And Fair Contractual Practices',
    coreSubject: 'consumerIssues',
  },
  {
    key: 'protectingConsumersHealthAndSafety',
    label: 'Protecting Consumers Health And Safety',
    coreSubject: 'consumerIssues',
  },
  {
    key: 'sustainableConsumption',
    label: 'Sustainable Consumption',
    coreSubject: 'consumerIssues',
  },
  {
    key: 'consumerServiceSupportAndComplai',
    label: 'Consumer Service, Support, And Complaint And Dispute Resolution',
    coreSubject: 'consumerIssues',
  },
  {
    key: 'consumerDataProtectionAndPrivacy',
    label: 'Consumer Data Protection And Privacy',
    coreSubject: 'consumerIssues',
  },
  {
    key: 'accessToEssentialServices',
    label: 'Access To Essential Services',
    coreSubject: 'consumerIssues',
  },
  {
    key: 'educationAndAwareness',
    label: 'Education And Awareness',
    coreSubject: 'consumerIssues',
  },
  {
    key: 'communityInvolvement',
    label: 'Community Involvement',
    coreSubject: 'communityInvolvementAndDevelopment',
  },
  {
    key: 'educationAndCulture',
    label: 'Education And Culture',
    coreSubject: 'communityInvolvementAndDevelopment',
  },
  {
    key: 'employmentCreationAndSkillsDevelopment',
    label: 'Employment Creation And Skills Development',
    coreSubject: 'communityInvolvementAndDevelopment',
  },
  {
    key: 'technologyDevelopmentAndAccess',
    label: 'Technology Development And Access',
    coreSubject: 'communityInvolvementAndDevelopment',
  },
  {
    key: 'wealthAndIncomeCreation',
    label: 'Wealth And Income Creation',
    coreSubject: 'communityInvolvementAndDevelopment',
  },
  {
    key: 'health',
    label: 'Health',
    coreSubject: 'communityInvolvementAndDevelopment',
  },
  {
    key: 'socialInvestment',
    label: 'Social Investment',
    coreSubject: 'communityInvolvementAndDevelopment',
  },
];
