const input = [
    {
        isExternal: true,
        classValue: 3, //1, 2, 3
        coreSubjects: [
            {
            "coreSubject":"organizationalGovernance",
            "rating": 3
            },
            {
            "coreSubject":"humanRights",
            "rating": 4
            },
            {
            "coreSubject":"laborPractices",
            "rating": 5
            },
            {
            "coreSubject":"theEnvironment",
            "rating": 6
            },
            {
            "coreSubject":"fairOperatingPractices",
            "rating": 7
            },
            {
            "coreSubject":"consumerIssues",
            "rating": 2
            },
            {
            "coreSubject":"communityInvolvementAndDevelopment",
            "rating": 1
            }
        ],
        issueOfInterest: [
            {
                "coreSubject":"organizationalGovernance",
                "data":[
                    {
                        "issueOfInterest":"transparency",
                        "rating": 2
                    },
                    {
                        "issueOfInterest":"ethicalConduct",
                        "rating": 1
                    },
                    {
                        "issueOfInterest":"respectOfRuleOfLaw",
                        "rating": 3
                    },
                    {
                        "issueOfInterest":"accountability",
                        "rating": 4
                    },
                    {
                        "issueOfInterest":"corporateGovernance",
                        "rating": 5
                    }
                ]
            },
            {
                "coreSubject":"humanRights",
                "data":[
                    {
                        "issueOfInterest":"humanRightsRisksSituations",
                        "rating":2
                    },
                    {
                        "issueOfInterest":"dueDiligence",
                        "rating": 1
                    },
                    {
                        "issueOfInterest":"avoindanceOfComplicity",
                        "rating":3
                    },
                    {
                        "issueOfInterest":"resolvingGievances",
                        "rating":4
                    },
                    {
                        "issueOfInterest":"discriminationAndVulnerableGroups",
                        "rating":5
                    },
                    {
                        "issueOfInterest":"civilAndPoliticalRights",
                        "rating":6
                    },
                    {
                        "issueOfInterest":"economicSocialAndCulturalRights",
                        "rating":7
                    },
                    {
                        "issueOfInterest":"fundamentalPrinciplesAndRightsAtWork",
                        "rating":8
                    }
                ]
            },
            {
                "coreSubject":"laborPractices",
                "data":[
                    {
                        "issueOfInterest":"conditionsOfWorkAndSocialProtection",
                        "rating":2
                    },
                    {
                        "issueOfInterest":"employmentAndEmploymentRelationships",
                        "rating":1
                    },
                    {
                        "issueOfInterest":"socialDialogue",
                        "rating":3
                    },
                    {
                        "issueOfInterest":"healthAndSafetyAtWork",
                        "rating":4
                    },
                    {
                        "issueOfInterest":"humanDevelopmentAndTrainingInTheWorkplace",
                        "rating":5
                    }
                ]
                },
            {
                "coreSubject":"theEnvironment",
                "data":[
                    {
                        "issueOfInterest":"sustainableResourceUse",
                        "rating":2
                    },
                    {
                        "issueOfInterest":"preventionOfPollution",
                        "rating":1
                    },
                    {
                        "issueOfInterest":"climateChangeMitigationAndAdaptation",
                        "rating":3
                    },
                    {
                        "issueOfInterest":"ProtectionOfTheEnvironmentBiodiversityAndRestorationOfNaturalHabitats",
                        "rating":4
                    }
                ]
                },
            {
                "coreSubject":"fairOperatingPractices",
                "data":[
                        {
                            "issueOfInterest":"responsiblePoliticalInvolvement",
                            "rating":2
                        },
                        {
                            "issueOfInterest":"antiCorruption",
                            "rating":1
                        },
                        {
                            "issueOfInterest":"fairCompetition",
                            "rating":3
                        },
                        {
                            "issueOfInterest":"promotingSocialResponsibilityInTheValueChain",
                            "rating":4
                        },
                        {
                            "issueOfInterest":"respectForPropertyRights",
                            "rating":5
                        }
                    ]
                },
            {
                "coreSubject":"consumerIssues",
                "data": [
                    {
                        "issueOfInterest":"protectingConsumersHealthAndSafety",
                        "rating":2
                    },
                    {
                        "issueOfInterest":"fairMarketingFactualAndUnbiasedInformati",
                        "rating":1
                    },
                    {
                        "issueOfInterest":"sustainableConsumption",
                        "rating":3
                    },
                    {
                        "issueOfInterest":"consumerServiceSupportAndComplai",
                        "rating":4
                    },
                    {
                        "issueOfInterest":"consumerDataProtectionAndPrivacy",
                        "rating":5
                    },
                    {
                        "issueOfInterest":"accessToEssentialServices",
                        "rating":6
                    },
                    {
                        "issueOfInterest":"educationAndAwareness",
                        "rating":7
                    }
                ]
            },
            {
                "coreSubject":"communityInvolvementAndDevelopment",
                "data":[
                    {
                        "issueOfInterest":"educationAndCulture",
                        "rating":2
                    },
                    {
                        "issueOfInterest":"communityInvolvement",
                        "rating":1
                    },
                    {
                        "issueOfInterest":"employmentCreationAndSkillsDevelopment",
                        "rating":3
                    },
                    {
                        "issueOfInterest":"technologyDevelopmentAndAccess",
                        "rating":4
                    },
                    {
                        "issueOfInterest":"wealthAndIncomeCreation",
                        "rating":5
                    },
                    {
                        "issueOfInterest":"health",
                        "rating":6
                    },
                    {
                        "issueOfInterest":"socialInvestment",
                        "rating":7
                    }
                ]
            }
        ]
    },
    {
        isExternal: false,
        classValue: 3, //1, 2, 3
        coreSubjects: [
            {
            "coreSubject":"organizationalGovernance",
            "rating": 3
            },
            {
            "coreSubject":"humanRights",
            "rating": 4
            },
            {
            "coreSubject":"laborPractices",
            "rating": 5
            },
            {
            "coreSubject":"theEnvironment",
            "rating": 6
            },
            {
            "coreSubject":"fairOperatingPractices",
            "rating": 7
            },
            {
            "coreSubject":"consumerIssues",
            "rating": 2
            },
            {
            "coreSubject":"communityInvolvementAndDevelopment",
            "rating": 1
            }
        ],
        issueOfInterest: [
            {
                "coreSubject":"organizationalGovernance",
                "data":[
                    {
                        "issueOfInterest":"transparency",
                        "rating": 2
                    },
                    {
                        "issueOfInterest":"ethicalConduct",
                        "rating": 1
                    },
                    {
                        "issueOfInterest":"respectOfRuleOfLaw",
                        "rating": 3
                    },
                    {
                        "issueOfInterest":"accountability",
                        "rating": 4
                    },
                    {
                        "issueOfInterest":"corporateGovernance",
                        "rating": 5
                    }
                ]
            },
            {
                "coreSubject":"humanRights",
                "data":[
                    {
                        "issueOfInterest":"humanRightsRisksSituations",
                        "rating":2
                    },
                    {
                        "issueOfInterest":"dueDiligence",
                        "rating": 1
                    },
                    {
                        "issueOfInterest":"avoindanceOfComplicity",
                        "rating":3
                    },
                    {
                        "issueOfInterest":"resolvingGievances",
                        "rating":4
                    },
                    {
                        "issueOfInterest":"discriminationAndVulnerableGroups",
                        "rating":5
                    },
                    {
                        "issueOfInterest":"civilAndPoliticalRights",
                        "rating":6
                    },
                    {
                        "issueOfInterest":"economicSocialAndCulturalRights",
                        "rating":7
                    },
                    {
                        "issueOfInterest":"fundamentalPrinciplesAndRightsAtWork",
                        "rating":8
                    }
                ]
            },
            {
                "coreSubject":"laborPractices",
                "data":[
                    {
                        "issueOfInterest":"conditionsOfWorkAndSocialProtection",
                        "rating":2
                    },
                    {
                        "issueOfInterest":"employmentAndEmploymentRelationships",
                        "rating":1
                    },
                    {
                        "issueOfInterest":"socialDialogue",
                        "rating":3
                    },
                    {
                        "issueOfInterest":"healthAndSafetyAtWork",
                        "rating":4
                    },
                    {
                        "issueOfInterest":"humanDevelopmentAndTrainingInTheWorkplace",
                        "rating":5
                    }
                ]
                },
            {
                "coreSubject":"theEnvironment",
                "data":[
                    {
                        "issueOfInterest":"sustainableResourceUse",
                        "rating":2
                    },
                    {
                        "issueOfInterest":"preventionOfPollution",
                        "rating":1
                    },
                    {
                        "issueOfInterest":"climateChangeMitigationAndAdaptation",
                        "rating":3
                    },
                    {
                        "issueOfInterest":"ProtectionOfTheEnvironmentBiodiversityAndRestorationOfNaturalHabitats",
                        "rating":4
                    }
                ]
                },
            {
                "coreSubject":"fairOperatingPractices",
                "data":[
                        {
                            "issueOfInterest":"responsiblePoliticalInvolvement",
                            "rating":2
                        },
                        {
                            "issueOfInterest":"antiCorruption",
                            "rating":1
                        },
                        {
                            "issueOfInterest":"fairCompetition",
                            "rating":3
                        },
                        {
                            "issueOfInterest":"promotingSocialResponsibilityInTheValueChain",
                            "rating":4
                        },
                        {
                            "issueOfInterest":"respectForPropertyRights",
                            "rating":5
                        }
                    ]
                },
            {
                "coreSubject":"consumerIssues",
                "data": [
                    {
                        "issueOfInterest":"protectingConsumersHealthAndSafety",
                        "rating":2
                    },
                    {
                        "issueOfInterest":"fairMarketingFactualAndUnbiasedInformati",
                        "rating":1
                    },
                    {
                        "issueOfInterest":"sustainableConsumption",
                        "rating":3
                    },
                    {
                        "issueOfInterest":"consumerServiceSupportAndComplai",
                        "rating":4
                    },
                    {
                        "issueOfInterest":"consumerDataProtectionAndPrivacy",
                        "rating":5
                    },
                    {
                        "issueOfInterest":"accessToEssentialServices",
                        "rating":6
                    },
                    {
                        "issueOfInterest":"educationAndAwareness",
                        "rating":7
                    }
                ]
            },
            {
                "coreSubject":"communityInvolvementAndDevelopment",
                "data":[
                    {
                        "issueOfInterest":"educationAndCulture",
                        "rating":2
                    },
                    {
                        "issueOfInterest":"communityInvolvement",
                        "rating":1
                    },
                    {
                        "issueOfInterest":"employmentCreationAndSkillsDevelopment",
                        "rating":3
                    },
                    {
                        "issueOfInterest":"technologyDevelopmentAndAccess",
                        "rating":4
                    },
                    {
                        "issueOfInterest":"wealthAndIncomeCreation",
                        "rating":5
                    },
                    {
                        "issueOfInterest":"health",
                        "rating":6
                    },
                    {
                        "issueOfInterest":"socialInvestment",
                        "rating":7
                    }
                ]
            }
        ]
    },    
    {
        isExternal: true,
        classValue: 3, //1, 2, 3
        coreSubjects: [
            {
            "coreSubject":"organizationalGovernance",
            "rating": 3
            },
            {
            "coreSubject":"humanRights",
            "rating": 4
            },
            {
            "coreSubject":"laborPractices",
            "rating": 5
            },
            {
            "coreSubject":"theEnvironment",
            "rating": 6
            },
            {
            "coreSubject":"fairOperatingPractices",
            "rating": 7
            },
            {
            "coreSubject":"consumerIssues",
            "rating": 2
            },
            {
            "coreSubject":"communityInvolvementAndDevelopment",
            "rating": 1
            }
        ],
        issueOfInterest: [
            {
                "coreSubject":"organizationalGovernance",
                "data":[
                    {
                        "issueOfInterest":"transparency",
                        "rating": 2
                    },
                    {
                        "issueOfInterest":"ethicalConduct",
                        "rating": 1
                    },
                    {
                        "issueOfInterest":"respectOfRuleOfLaw",
                        "rating": 3
                    },
                    {
                        "issueOfInterest":"accountability",
                        "rating": 4
                    },
                    {
                        "issueOfInterest":"corporateGovernance",
                        "rating": 5
                    }
                ]
            },
            {
                "coreSubject":"humanRights",
                "data":[
                    {
                        "issueOfInterest":"humanRightsRisksSituations",
                        "rating":2
                    },
                    {
                        "issueOfInterest":"dueDiligence",
                        "rating": 1
                    },
                    {
                        "issueOfInterest":"avoindanceOfComplicity",
                        "rating":3
                    },
                    {
                        "issueOfInterest":"resolvingGievances",
                        "rating":4
                    },
                    {
                        "issueOfInterest":"discriminationAndVulnerableGroups",
                        "rating":5
                    },
                    {
                        "issueOfInterest":"civilAndPoliticalRights",
                        "rating":6
                    },
                    {
                        "issueOfInterest":"economicSocialAndCulturalRights",
                        "rating":7
                    },
                    {
                        "issueOfInterest":"fundamentalPrinciplesAndRightsAtWork",
                        "rating":8
                    }
                ]
            },
            {
                "coreSubject":"laborPractices",
                "data":[
                    {
                        "issueOfInterest":"conditionsOfWorkAndSocialProtection",
                        "rating":2
                    },
                    {
                        "issueOfInterest":"employmentAndEmploymentRelationships",
                        "rating":1
                    },
                    {
                        "issueOfInterest":"socialDialogue",
                        "rating":3
                    },
                    {
                        "issueOfInterest":"healthAndSafetyAtWork",
                        "rating":4
                    },
                    {
                        "issueOfInterest":"humanDevelopmentAndTrainingInTheWorkplace",
                        "rating":5
                    }
                ]
                },
            {
                "coreSubject":"theEnvironment",
                "data":[
                    {
                        "issueOfInterest":"sustainableResourceUse",
                        "rating":2
                    },
                    {
                        "issueOfInterest":"preventionOfPollution",
                        "rating":1
                    },
                    {
                        "issueOfInterest":"climateChangeMitigationAndAdaptation",
                        "rating":3
                    },
                    {
                        "issueOfInterest":"ProtectionOfTheEnvironmentBiodiversityAndRestorationOfNaturalHabitats",
                        "rating":4
                    }
                ]
                },
            {
                "coreSubject":"fairOperatingPractices",
                "data":[
                        {
                            "issueOfInterest":"responsiblePoliticalInvolvement",
                            "rating":2
                        },
                        {
                            "issueOfInterest":"antiCorruption",
                            "rating":1
                        },
                        {
                            "issueOfInterest":"fairCompetition",
                            "rating":3
                        },
                        {
                            "issueOfInterest":"promotingSocialResponsibilityInTheValueChain",
                            "rating":4
                        },
                        {
                            "issueOfInterest":"respectForPropertyRights",
                            "rating":5
                        }
                    ]
                },
            {
                "coreSubject":"consumerIssues",
                "data": [
                    {
                        "issueOfInterest":"protectingConsumersHealthAndSafety",
                        "rating":2
                    },
                    {
                        "issueOfInterest":"fairMarketingFactualAndUnbiasedInformati",
                        "rating":1
                    },
                    {
                        "issueOfInterest":"sustainableConsumption",
                        "rating":3
                    },
                    {
                        "issueOfInterest":"consumerServiceSupportAndComplai",
                        "rating":4
                    },
                    {
                        "issueOfInterest":"consumerDataProtectionAndPrivacy",
                        "rating":5
                    },
                    {
                        "issueOfInterest":"accessToEssentialServices",
                        "rating":6
                    },
                    {
                        "issueOfInterest":"educationAndAwareness",
                        "rating":7
                    }
                ]
            },
            {
                "coreSubject":"communityInvolvementAndDevelopment",
                "data":[
                    {
                        "issueOfInterest":"educationAndCulture",
                        "rating":2
                    },
                    {
                        "issueOfInterest":"communityInvolvement",
                        "rating":1
                    },
                    {
                        "issueOfInterest":"employmentCreationAndSkillsDevelopment",
                        "rating":3
                    },
                    {
                        "issueOfInterest":"technologyDevelopmentAndAccess",
                        "rating":4
                    },
                    {
                        "issueOfInterest":"wealthAndIncomeCreation",
                        "rating":5
                    },
                    {
                        "issueOfInterest":"health",
                        "rating":6
                    },
                    {
                        "issueOfInterest":"socialInvestment",
                        "rating":7
                    }
                ]
            }
        ]
    },
    {
        isExternal: false,
        classValue: 3, //1, 2, 3
        coreSubjects: [
            {
            "coreSubject":"organizationalGovernance",
            "rating": 3
            },
            {
            "coreSubject":"humanRights",
            "rating": 4
            },
            {
            "coreSubject":"laborPractices",
            "rating": 5
            },
            {
            "coreSubject":"theEnvironment",
            "rating": 6
            },
            {
            "coreSubject":"fairOperatingPractices",
            "rating": 7
            },
            {
            "coreSubject":"consumerIssues",
            "rating": 2
            },
            {
            "coreSubject":"communityInvolvementAndDevelopment",
            "rating": 1
            }
        ],
        issueOfInterest: [
            {
                "coreSubject":"organizationalGovernance",
                "data":[
                    {
                        "issueOfInterest":"transparency",
                        "rating": 2
                    },
                    {
                        "issueOfInterest":"ethicalConduct",
                        "rating": 1
                    },
                    {
                        "issueOfInterest":"respectOfRuleOfLaw",
                        "rating": 3
                    },
                    {
                        "issueOfInterest":"accountability",
                        "rating": 4
                    },
                    {
                        "issueOfInterest":"corporateGovernance",
                        "rating": 5
                    }
                ]
            },
            {
                "coreSubject":"humanRights",
                "data":[
                    {
                        "issueOfInterest":"humanRightsRisksSituations",
                        "rating":2
                    },
                    {
                        "issueOfInterest":"dueDiligence",
                        "rating": 1
                    },
                    {
                        "issueOfInterest":"avoindanceOfComplicity",
                        "rating":3
                    },
                    {
                        "issueOfInterest":"resolvingGievances",
                        "rating":4
                    },
                    {
                        "issueOfInterest":"discriminationAndVulnerableGroups",
                        "rating":5
                    },
                    {
                        "issueOfInterest":"civilAndPoliticalRights",
                        "rating":6
                    },
                    {
                        "issueOfInterest":"economicSocialAndCulturalRights",
                        "rating":7
                    },
                    {
                        "issueOfInterest":"fundamentalPrinciplesAndRightsAtWork",
                        "rating":8
                    }
                ]
            },
            {
                "coreSubject":"laborPractices",
                "data":[
                    {
                        "issueOfInterest":"conditionsOfWorkAndSocialProtection",
                        "rating":2
                    },
                    {
                        "issueOfInterest":"employmentAndEmploymentRelationships",
                        "rating":1
                    },
                    {
                        "issueOfInterest":"socialDialogue",
                        "rating":3
                    },
                    {
                        "issueOfInterest":"healthAndSafetyAtWork",
                        "rating":4
                    },
                    {
                        "issueOfInterest":"humanDevelopmentAndTrainingInTheWorkplace",
                        "rating":5
                    }
                ]
                },
            {
                "coreSubject":"theEnvironment",
                "data":[
                    {
                        "issueOfInterest":"sustainableResourceUse",
                        "rating":2
                    },
                    {
                        "issueOfInterest":"preventionOfPollution",
                        "rating":1
                    },
                    {
                        "issueOfInterest":"climateChangeMitigationAndAdaptation",
                        "rating":3
                    },
                    {
                        "issueOfInterest":"ProtectionOfTheEnvironmentBiodiversityAndRestorationOfNaturalHabitats",
                        "rating":4
                    }
                ]
                },
            {
                "coreSubject":"fairOperatingPractices",
                "data":[
                        {
                            "issueOfInterest":"responsiblePoliticalInvolvement",
                            "rating":2
                        },
                        {
                            "issueOfInterest":"antiCorruption",
                            "rating":1
                        },
                        {
                            "issueOfInterest":"fairCompetition",
                            "rating":3
                        },
                        {
                            "issueOfInterest":"promotingSocialResponsibilityInTheValueChain",
                            "rating":4
                        },
                        {
                            "issueOfInterest":"respectForPropertyRights",
                            "rating":5
                        }
                    ]
                },
            {
                "coreSubject":"consumerIssues",
                "data": [
                    {
                        "issueOfInterest":"protectingConsumersHealthAndSafety",
                        "rating":2
                    },
                    {
                        "issueOfInterest":"fairMarketingFactualAndUnbiasedInformati",
                        "rating":1
                    },
                    {
                        "issueOfInterest":"sustainableConsumption",
                        "rating":3
                    },
                    {
                        "issueOfInterest":"consumerServiceSupportAndComplai",
                        "rating":4
                    },
                    {
                        "issueOfInterest":"consumerDataProtectionAndPrivacy",
                        "rating":5
                    },
                    {
                        "issueOfInterest":"accessToEssentialServices",
                        "rating":6
                    },
                    {
                        "issueOfInterest":"educationAndAwareness",
                        "rating":7
                    }
                ]
            },
            {
                "coreSubject":"communityInvolvementAndDevelopment",
                "data":[
                    {
                        "issueOfInterest":"educationAndCulture",
                        "rating":2
                    },
                    {
                        "issueOfInterest":"communityInvolvement",
                        "rating":1
                    },
                    {
                        "issueOfInterest":"employmentCreationAndSkillsDevelopment",
                        "rating":3
                    },
                    {
                        "issueOfInterest":"technologyDevelopmentAndAccess",
                        "rating":4
                    },
                    {
                        "issueOfInterest":"wealthAndIncomeCreation",
                        "rating":5
                    },
                    {
                        "issueOfInterest":"health",
                        "rating":6
                    },
                    {
                        "issueOfInterest":"socialInvestment",
                        "rating":7
                    }
                ]
            }
        ]
    }
]

const getRankIncrement = (numberOfAnswers) => Number.parseFloat((100/numberOfAnswers).toFixed(3));

const getIntExtCredits = (input) => {
    for (var element of input) {

    }
}

/* 
    Input: 
    Output: Array[{score, weightedScore}]
    
*/
const findScoreWScore = (input) => {
    const _input = [...input];
    const internalSum = sum(_input, 'classValue', element => !element.isExternal );
    const externalSum = sum(_input, 'classValue', element => element.isExternal );

    const action = (ansersCount, answer, coreSubjectsRankIncrement, isExternal, classValue) => {
        const score = Number.parseFloat((((ansersCount + 1) - answer.rating ||0) * coreSubjectsRankIncrement).toFixed(2));
        var weightedScore;
        if (isExternal) {
            weightedScore = (classValue / (isExternal ? externalSum : internalSum)) * score;
            // console.log(score, weightedScore);
        }
        answer.weightedScore = weightedScore;
        answer.score = score;  
    }

    // console.log(internalSum, externalSum);
    for (var element of _input) {
        const isExternal = element.isExternal;
        const classValue = element.classValue;
        const coreSubjects = element.coreSubjects;
        const coreSubjectsAnswers = coreSubjects;
        const issueOfInterests = element.issueOfInterest;
        const coreSubjectsRankIncrement = getRankIncrement(coreSubjectsAnswers.length);

        for (var answer of coreSubjectsAnswers) {
            action(coreSubjectsAnswers.length, answer, coreSubjectsRankIncrement, isExternal, classValue);
        }

        for (var issueOfInterest of issueOfInterests) {
            const issueOfInterestAnswers = issueOfInterest.data;
            const issueOfInterestRankIncrement = getRankIncrement(issueOfInterestAnswers.length);
            for (var answer of issueOfInterestAnswers) {
                action(issueOfInterestAnswers.length, answer, issueOfInterestRankIncrement, isExternal, classValue);
            }
        }
    }
    return _input;
}

const findFinalScores = input => {
    const getFinalScoresMap = () => ({
        internal: {},
        external: {},
        overall: {},
    });
    const internalCount = count(input, element => !element.isExternal );
    const finalScoresMap = {};
    const constructFinalScoreMap = (answer, isExternal, isCoresubject, elkey) => {
        const key = isCoresubject ? answer.coreSubject : answer.issueOfInterest;        
        if (!(elkey in finalScoresMap)) {
            finalScoresMap[elkey] = getFinalScoresMap();
        }

        if (isExternal) {
            finalScoresMap[elkey].external[key] = 
                (finalScoresMap[elkey].external[key] || 0) + (answer.weightedScore || 0);
        } else {
            finalScoresMap[elkey].internal[key] = 
                (finalScoresMap[elkey].internal[key] || 0) + (answer.score || 0); 
            if (key === 'organizationalGovernance') {
                console.log(answer.score);
            }              
        }
    }

    const coreKey = 'coreSubjects';
    for (var element of input) {
        const isExternal = element.isExternal;
        const coreSubjects = element[coreKey];
        const coreSubjectsAnswers = coreSubjects;
        const issueOfInterests = element.issueOfInterest;

        for (var answer of coreSubjectsAnswers) {
            constructFinalScoreMap(answer, isExternal, true, coreKey);
        }
        for (var issueOfInterest of issueOfInterests) {
            const issueOfInterestAnswers = issueOfInterest.data;
            for (var answer of issueOfInterestAnswers) {
                constructFinalScoreMap(answer, isExternal, false, issueOfInterest.coreSubject);
            }
        }        
    }

    // find overall
    const mapElements = Object.keys(finalScoresMap);
    for (var id of mapElements) {
        var finalScoreMap = finalScoresMap[id];
        for (const key of Object.keys(finalScoreMap.internal)) {
            finalScoreMap.internal[key] = parseFloat(((finalScoreMap.internal[key] || 0) / internalCount).toFixed(2));
            finalScoreMap.overall[key] = parseFloat(
                ((finalScoreMap.internal[key] || 0) + (finalScoreMap.external[key] || 0)) / 2
            );
        }
    }

    return finalScoresMap;
}

const sortObjectByValue = object => {
    // convert to array
    const array = [];
    const keys = Object.keys(object);
    for (var key of keys) {
        array.push({
            value: object[key],
            label: key,
        });
    }
    return array.sort((a,b) => (a.value < b.value) ? 1 : ((b.value < a.value) ? -1 : 0)); 
}

const count = (array, condition, initialValue = 0) => {
    return array.reduce((previous, element) => condition(element) ? previous + 1 : previous, initialValue);
}

const sum = (array, key, condition, initialValue = 0) => {
    return array.reduce((previous, element) => condition(element) ? previous + element[key] : previous, initialValue);
}

const sortFinalResults = (coreSubjectsMapResults, issueOfInterestMapResults, issueOfInterestLimit = 4) => {
    const sortedCoreSubjects =coreSubjectsMapResults ?  sortObjectByValue(  coreSubjectsMapResults.overall   ) : null ;
    const sortedIssueOfInterest =sortedCoreSubjects ?  sortedCoreSubjects.map(({label}, index) => ({elements: index < issueOfInterestLimit ? sortObjectByValue(issueOfInterestMapResults[label].overall) : [], key: label})): null ;
    return {
        sortedCoreSubjects: sortedCoreSubjects,
        sortedIssueOfInterest: sortedIssueOfInterest,
    }
}

const convertToDBStructure = (sortedIssueOfInterest, mapResults) => {

    if(!sortedIssueOfInterest) return null ;
    
    const newArray = sortedIssueOfInterest.map(({elements, key}) => {
        const element = {
            coreSubject: key,
            relevanceCompanyValue: parseFloat((mapResults.coreSubjects.internal[key] || 0).toFixed(2)),
            relevanceStakeholdersValue: parseFloat((mapResults.coreSubjects.external[key] || 0).toFixed(2)),
            relevanceEmployeesValue: 0,
            weightValue: parseFloat((mapResults.coreSubjects.overall[key] || 0).toFixed(2)), // Overall score
            issueOfInterests: elements.map(({ label, value }) => ({
                issueOfInterest: label,
                weightValue: parseFloat((value || 0).toFixed(2)),
                relevanceEmployeesValue: 0,
                relevanceStakeholdersValue: parseFloat((mapResults[key]?.external?.[label] || 0).toFixed(2)),
                relevanceCompanyValue: parseFloat((mapResults[key]?.internal?.[label] || 0).toFixed(2)),
            })), 
        }
        return element;
    });
    return newArray;
}

const execute = (_input, issueOfInterest = 4) => {
    const scoresWeightScores = findScoreWScore(_input);
    const finalScores = findFinalScores(scoresWeightScores);
    // console.log("Final scoresWeightScores:", finalScores);

    const {sortedIssueOfInterest} = sortFinalResults(finalScores.coreSubjects ? finalScores.coreSubjects: null , finalScores, issueOfInterestLimit = issueOfInterest);
    const result = convertToDBStructure(sortedIssueOfInterest, finalScores);
    return result;
}

module.exports = {
    execute: execute
};

// const scoresWeightScores = findScoreWScore(input);
// const finalScores = findFinalScores(scoresWeightScores);
// const {sortedCoreSubjects, sortedIssueOfInterest} = sortFinalResults(finalScores.coreSubjects, finalScores, issueOfInterestLimit = 4);
// const result = convertToDBStructure(sortedIssueOfInterest, finalScores);
// console.log("Final:", JSON.stringify(result));

// console.log(execute(input, issueOfInterest = 4));