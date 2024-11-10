const questionTypes = require('./questionTypes');

module.exports = {
    id_in_template: "survey1",
    title : "Corporate Social Responsibility (CSR) Survey for External Stakeholders",
    description: "Corporate Social Responsibility (CSR) is a framework that can help companies identify, prevent, manage and mitigate possible adverse impacts and risks to their operations and supply chains. It covers a range of subject matters, to include organisational governance, human rights, labour practices, the environment, fair operating practices, ethics, consumer issues, community involvement and development and issues pertaining to anti-corruption and anti-bribery. When implemented correctly in organisations, ESG is a holistic management approach that incorporates the views and opinions of the organisation’s stakeholders, and can help organisations conduct their day-to-day operations in a responsible manner and grow sustainably",
    questions: [
        {
            id_in_template: null,
            type: questionTypes.free_text,
            question: "Name and Surname:",            
            answers: [
                {
                    id_in_template: null,
                    text: "",
                    category: '',
                    selected: false,
                },
            ]
        },   
        {
            id_in_template: null,
            type: questionTypes.free_text,
            question: "Organisation name:",            
            answers: [
                {
                    id_in_template: null,
                    text: "",
                    category: '',
                    selected: false,
                },
            ]
        },      
        {
            id_in_template: null,
            type: questionTypes.free_text,
            question: "Job role:",            
            answers: [
                {
                    id_in_template: null,
                    text: "",
                    category: '',
                    selected: false,
                },
            ]
        },                  
        {
            id_in_template: null,
            type: questionTypes.radio,
            question: "How would you perceive the organisation's current ESG performance using the scale of 1 - 5?",            
            answers: [
                {
                    id_in_template: null,
                    text: "1 (very poor)",
                    category: '',
                    selected: false,
                },
                {
                    id_in_template: null,
                    text: "2 (poor)",
                    category: '',
                    selected: false,
                },
                {
                    id_in_template: null,
                    text: "3 (average)",
                    category: '',
                    selected: false,
                },
                {
                    id_in_template: null,
                    text: "4 (good)",
                    category: '',
                    selected: false,
                },
                {
                    id_in_template: null,
                    text: "5 (very good)",
                    category: '',
                    selected: false,
                },
            ]
        },   
        {
            id_in_template: null,
            type: questionTypes.checkbox,
            max_selections: 3,
            question: "Which of the following areas regarding CSR do you believe the organisation has focused on until now? (Please select only up to three answers)",            
            answers: [
                {
                    id_in_template: null,
                    text: "(i.e. how the organisation is run, the structure, processes and systems in place at the organisation, how accountable, transparent and ethical the organisation is and whether it complies with national and international legislation)",
                    category: 'a) Organisational Governance ',
                    selected: false,
                },
                {
                    id_in_template: null,
                    text: "(i.e. whether the organisation complies with human rights legislation through its own operations and through the operations of its value chain, if it has processes in place to resolve grievances, if it does not discriminate in the workplace based on sex, religion, ethnic origin, sexual orientation, etc., and if it offers fundamental working rights to its employees, including civil, political, economic, social and cultural rights)",
                    category: 'b) Human Rights',
                    selected: false,
                },
                {
                    id_in_template: null,
                    text: "(i.e. conditions of work at the organisation for its employees, including health and safety and social protection, the organisation's relationship with its employees and how it invests in developing and training its workforce)",
                    category: 'c) Labour Practices',
                    selected: false,
                },
                {
                    id_in_template: null,
                    text: "(i.e. how the organisation manages its environmental impacts, to include prevention of pollution through waste, water and transport management, sustainable resource use such as energy, water and soil, climate change mitigation and adaptation and protection of environment, biodiversity and habitats)",
                    category: 'd) Environment',
                    selected: false,
                },
                {
                    id_in_template: null,
                    text: "(i.e. whether the organisation engages in activities that respect fair competition and responsible political involvement and that promote social responsibility in the value chain, if it has measures in place on anti-corruption and if it respects property and intellectual property rights)",
                    category: 'e) Fair Operating Practices',
                    selected: false,
                },
                {
                    id_in_template: null,
                    text: "(i.e. whether the organisation markets its products in a fair, factual and unbiased way, whether it adequately informs, educates and raises the awareness of its consumers on its products, whether it protects the health and safety of its consumers, if it promotes sustainable consumption, whether it protects the data and privacy of its consumers, and whether it offers customer satisfaction through its consumer service, support, and complaint and dispute resolution processes)",
                    category: 'f) Consumer Issues',
                    selected: false,
                },
                {
                    id_in_template: null,
                    text: "(i.e. how involved the organisation is with its local community, if it has invested in creating employment and wealth in its local community, if it has taken any action to improve the education and culture of its local community, if it has taken action to promote health and improve access to technology for its local community)",
                    category: 'g) Community Involvement and Development',
                    selected: false,
                },             
            ]
        },
        {
            id_in_template: null,
            type: questionTypes.radio,
            question: "Are you aware of any ESG activities the organisation is currently involved in?",            
            answers: [
                {
                    id_in_template: null,
                    text: "Yes",
                    category: '',
                    selected: false,
                },
                {
                    id_in_template: null,
                    text: "No",
                    category: '',
                    selected: false,
                },
            ]
        },  
        {
            id_in_template: null,
            type: questionTypes.order,
            question: "Considering what would be in the organisation's best interest, which areas do you think the organisation needs to focus on in their ESG strategy? Please rank all the following subjects in order of importance using a scale of 1-7 (where 1 = highest importance and 7 = lowest importance).",            
            answers: [
                {
                    id_in_template: 'organizationalGovernance',
                    text: "(i.e. how the organisation is run, the structure, processes and systems in place at the organisation, how accountable, transparent and ethical the organisation is and whether it complies with national and international legislation)",
                    category: 'a) Organisational Governance',
                    selected: false,
                },
                {
                    id_in_template: 'humanRights',
                    text: "(i.e. whether the organisation complies with human rights legislation through its own operations and through the operations of its value chain, if it has processes in place to resolve grievances, if it does not discriminate in the workplace based on sex, religion, ethnic origin, sexual orientation, etc., and if it offers fundamental working rights to its employees, including civil, political, economic, social and cultural rights)",
                    category: 'b) Human Rights',
                    selected: false,
                },
                {
                    id_in_template: 'laborPractices',
                    text: "(i.e. conditions of work at the organisation for its employees, including health and safety and social protection, the organisation's relationship with its employees and how it invests in developing and training its workforce)",
                    category: 'c) Labour Practices',
                    selected: false,
                },
                {
                    id_in_template: 'theEnvironment',
                    text: "(i.e. how the organisation manages its environmental impacts, to include prevention of pollution through waste, water and transport management, sustainable resource use such as energy, water and soil, climate change mitigation and adaptation and protection of environment, biodiversity and habitats)",
                    category: 'd) Environment',
                    selected: false,
                },
                {
                    id_in_template: 'fairOperatingPractices',
                    text: "(i.e. whether the organisation engages in activities that respect fair competition and responsible political involvement and that promote social responsibility in the value chain, if it has measures in place on anti-corruption and if it respects property and intellectual property rights)",
                    category: 'e) Fair Operating Practices',
                    selected: false,
                },
                {
                    id_in_template: 'consumerIssues',
                    text: "(i.e. whether the organisation markets its products in a fair, factual and unbiased way, whether it adequately informs, educates and raises the awareness of its consumers on its products, whether it protects the health and safety of its consumers, if it promotes sustainable consumption, whether it protects the data and privacy of its consumers, and whether it offers customer satisfaction through its consumer service, support, and complaint and dispute resolution processes)",
                    category: 'f) Consumer Issues',
                    selected: false,
                },
                {
                    id_in_template: 'communityInvolvementAndDevelopment',
                    text: "(i.e. how involved the organisation is with its local community, if it has invested in creating employment and wealth in its local community, if it has taken any action to improve the education and culture of its local community, if it has taken action to promote health and improve access to technology for its local community)",
                    category: 'g) Community Involvement and Development',
                    selected: false,
                },
            ]
        },
        {
            id_in_template: 'organizationalGovernance',
            type: questionTypes.order,
            question: "Considering what would be in the organisation's best interest to address in its ESG strategy, how would you rank the following issues under Organisational Governance? Please rank all the sub-issues in order of importance using a scale of 1-5 (where 1 = highest importance and 5 = lowest importance).",            
            answers: [
                {
                    id_in_template: 'ethicalConduct',
                    text: "Ethical conduct",
                    category: 'a) Organisational Governance',
                    selected: false,
                },
                {
                    id_in_template: 'transparency',
                    text: "Transparency",
                    category: 'b) Organisational Governance',
                    selected: false,
                },
                {
                    id_in_template: 'respectOfRuleOfLaw',
                    text: "Respect of rule of law",
                    category: 'c) Organisational Governance',
                    selected: false,
                },
                {
                    id_in_template: 'accountability',
                    text: "Accountability",
                    category: 'd) Organisational Governance',
                    selected: false,
                },
                {
                    id_in_template: 'corporateGovernance',
                    text: "Corporate governance",
                    category: 'e) Organisational Governance',
                    selected: false,
                },
            ]
        },            
        {
            id_in_template: 'humanRights',
            type: questionTypes.order,
            question: "Considering what would be in the organisation's best interest to address in its ESG strategy, how would you rank the following issues under Human Rights? Please rank all the issues in order of importance using a scale of 1-8 (where 1 = highest importance and 8 = lowest importance).",            
            answers: [
                {
                    id_in_template: 'dueDiligence',
                    text: "Due diligence",
                    category: 'a) Human Rights',
                    selected: false,
                },
                {
                    id_in_template: 'humanRightsRisksSituations',
                    text: "Human Rights risk situations",
                    category: 'b) Human Rights',
                    selected: false,
                },
                {
                    id_in_template: 'avoindanceOfComplicity',
                    text: "Avoidance of complicity",
                    category: 'c) Human Rights',
                    selected: false,
                },
                {
                    id_in_template: 'resolvingGievances',
                    text: "Resolving grievances",
                    category: 'd) Human Rights',
                    selected: false,
                },
                {
                    id_in_template: 'discriminationAndVulnerableGroups',
                    text: "Discrimitation and vulnernable groups",
                    category: 'e) Human Rights',
                    selected: false,
                },
                {
                    id_in_template: 'civilAndPoliticalRights',
                    text: "Civil and political rights",
                    category: 'f) Human Rights',
                    selected: false,
                },
                {
                    id_in_template: 'economicSocialAndCulturalRights',
                    text: "Economic, social and culture rights",
                    category: 'g) Human Rights',
                    selected: false,
                },
                {
                    id_in_template: 'fundamentalPrinciplesAndRightsAtWork',
                    text: "Fundamental principles and rights at work",
                    category: 'h) Human Rights',
                    selected: false,
                },
            ]
        },     
        {
            id_in_template: 'laborPractices',
            type: questionTypes.order,
            question: "Considering what would be in the organisation's best interest to address in its ESG strategy, how would you rank the following issues under Labour Practices? Please rank all the issues in order of importance using a scale of 1-5 (where 1 = highest importance and 5 = lowest importance).",            
            answers: [
                {
                    id_in_template: 'employmentAndEmploymentRelationships',
                    text: "a) Employment and employment relationships",
                    category: 'Labour Practices',
                    selected: false,
                },
                {
                    id_in_template: 'conditionsOfWorkAndSocialProtection',
                    text: "b) Conditions of work and social protections",
                    category: 'Labour Practices',
                    selected: false,
                },
                {
                    id_in_template: 'socialDialogue',
                    text: "c) Social dialogue",
                    category: 'Labour Practices',
                    selected: false,
                },
                {
                    id_in_template: 'healthAndSafetyAtWork',
                    text: "d) Health and safety at work",
                    category: 'Labour Practices',
                    selected: false,
                },
                {
                    id_in_template: 'humanDevelopmentAndTrainingInTheWorkplace',
                    text: "e) Human development and training in the workplace",
                    category: 'Labour Practices',
                    selected: false,
                },
            ]
        },  
        {
            id_in_template: 'theEnvironment',
            type: questionTypes.order,
            question: "Considering what would be in the organisation's best interest to address in its ESG strategy, how would you rank the following issues under Environment? Please rank all the issues in order of importance using a scale of 1-4 (where 1 = highest importance and 4 = lowest importance).",            
            answers: [
                {
                    id_in_template: 'preventionOfPollution',
                    text: "Prevention of pollution",
                    category: 'a) Environment',
                    selected: false,
                },
                {
                    id_in_template: 'sustainableResourceUse',
                    text: "Sustainable resource use",
                    category: 'b) Environment',
                    selected: false,
                },
                {
                    id_in_template: 'climateChangeMitigationAndAdaptation',
                    text: "Climate change mitigation and adaptation",
                    category: 'c) Environment',
                    selected: false,
                },
                {
                    id_in_template: 'ProtectionOfTheEnvironmentBiodiversityAndRestorationOfNaturalHabitats',
                    text: "Protection of the environment, biodiversity and restoration of natural habitats",
                    category: 'd) Environment',
                    selected: false,
                },
            ]
        },        
        {
            id_in_template: 'fairOperatingPractices',
            type: questionTypes.order,
            question: "Considering what would be in the organisation's best interest to address in its ESG strategy, how would you rank the following issues under Fair Operating Practices? Please rank all the issues in order of importance using a scale of 1-5 (where 1 = highest importance and 5 = lowest importance).",            
            answers: [
                {
                    id_in_template: 'antiCorruption',
                    text: "Anti-corruption",
                    category: 'a) Fair Operating Practices',
                    selected: false,
                },
                {
                    id_in_template: 'responsiblePoliticalInvolvement',
                    text: "Responsible political involvement",
                    category: 'b) Fair Operating Practices',
                    selected: false,
                },
                {
                    id_in_template: 'fairCompetition',
                    text: "Fair competition",
                    category: 'c) Fair Operating Practices',
                    selected: false,
                },
                {
                    id_in_template: 'promotingSocialResponsibilityInTheValueChain',
                    text: "Promoting social responsibility in the value chain",
                    category: 'd) Fair Operating Practices',
                    selected: false,
                },
                {
                    id_in_template: 'respectForPropertyRights',
                    text: "Respect for property rights",
                    category: 'e) Fair Operating Practices',
                    selected: false,
                },
            ]
        }, 
        {
            id_in_template: 'consumerIssues',
            type: questionTypes.order,
            question: "Considering what would be in the organisation's best interest to address in its ESG strategy, how would you rank the following issues under Consumer Issues? Please rank all the issues in order of importance using a scale of 1-7 (where 1 = highest importance and 7 = lowest importance).",            
            answers: [
                {
                    id_in_template: 'fairMarketingFactualAndUnbiasedInformati',
                    text: "Fair marketing, factual and unbiased information and fair contractual practices",
                    category: 'a) Consumer Issues',
                    selected: false,
                },
                {
                    id_in_template: 'protectingConsumersHealthAndSafety',
                    text: "Protecting consumers' health and safety",
                    category: 'b) Consumer Issues',
                    selected: false,
                },
                {
                    id_in_template: 'sustainableConsumption',
                    text: "Sustainable consumption",
                    category: 'c) Consumer Issues',
                    selected: false,
                },
                {
                    id_in_template: 'consumerServiceSupportAndComplai',
                    text: "Consumer service, support and complaint and dispute resolution",
                    category: 'd) Consumer Issues',
                    selected: false,
                },
                {
                    id_in_template: 'consumerDataProtectionAndPrivacy',
                    text: "Consumer data protection and privacys",
                    category: 'e) Consumer Issues',
                    selected: false,
                },
                {
                    id_in_template: 'accessToEssentialServices',
                    text: "Access to essential services",
                    category: 'f) Consumer Issues',
                    selected: false,
                },
                {
                    id_in_template: 'educationAndAwareness',
                    text: "Education and awareness",
                    category: 'g) Consumer Issues',
                    selected: false,
                },
            ]
        },
        {
            id_in_template: 'communityInvolvementAndDevelopment',
            type: questionTypes.order,
            question: "Considering what would be in the organisation's best interest to address in its ESG strategy, how would you rank the following issues under Community Involvement and Development? Please rank all the issues in order of importance using a scale of 1-7 (where 1 = highest importance and 7 = lowest importance).",            
            answers: [
                {
                    id_in_template: 'communityInvolvement',
                    text: "Community Involvement",
                    category: 'a) Community Involvement ad Development',
                    selected: false,
                },
                {
                    id_in_template: 'educationAndCulture',
                    text: "Education and culture",
                    category: 'b) Community Involvement ad Development',
                    selected: false,
                },
                {
                    id_in_template: 'employmentCreationAndSkillsDevelopment',
                    text: "Employment creation and skills development",
                    category: 'c) Community Involvement ad Development',
                    selected: false,
                },
                {
                    id_in_template: 'technologyDevelopmentAndAccess',
                    text: "Technology development and access",
                    category: 'd) Community Involvement ad Development',
                    selected: false,
                },
                {
                    id_in_template: 'wealthAndIncomeCreation',
                    text: "Wealth and income creation",
                    category: 'e) Community Involvement ad Development',
                    selected: false,
                },
                {
                    id_in_template: 'health',
                    text: "Health",
                    category: 'f) Community Involvement ad Development',
                    selected: false,
                },
                {
                    id_in_template: 'socialInvestment',
                    text: "Social Investment",
                    category: 'g) Community Involvement ad Development',
                    selected: false,
                },
            ]
        },
        {
            id_in_template: null,
            type: questionTypes.radio,
            question: "Would you consider how socially responsible an organisation is, in your decision to do business/commercially engage with them?",            
            answers: [
                {
                    id_in_template: null,
                    text: "Yes",
                    category: '',
                    selected: false,
                },
                {
                    id_in_template: null,
                    text: "No",
                    category: '',
                    selected: false,
                },
                {
                    id_in_template: null,
                    text: "if yes, Why?",
                    category: '',
                    selected: false,
                    input: '',
                },
            ]
        },       
        {
            id_in_template: null,
            type: questionTypes.free_text,
            question: "If you have any comments, suggestions or ideas on how the organisation can become more socially responsible, please respond in the box below.",            
            answers: [
                {
                    id_in_template: null,
                    text: "",
                    category: '',
                    selected: false,
                },
            ]
        },         
    ],
}
