
const graphql = require('graphql')
const {
  GraphQLObjectType,
  GraphQLList,
  GraphQLString,
  GraphQLNonNull,
  GraphQLFloat,
  GraphQLInt,
  GraphQLBoolean,
} = graphql
const Stakeholder = require('../../models/stakeholder')


const StakeholderIssueOfInterestType = new GraphQLObjectType({
  name: 'StakeholderIssueOfInterestType',
  fields: () => ({
    issueOfInterest: {type: new GraphQLNonNull(GraphQLString)},
    rating: {type: GraphQLInt},
    relevanceValue: {type: GraphQLFloat},
    relevanceWeightValue: {type: GraphQLFloat},
  }),
})

const StakeholderCoreSubjectType = new GraphQLObjectType({
  name: 'StakeholderCoreSubjectType',
  fields: () => ({
    coreSubject: {type: new GraphQLNonNull(GraphQLString)},
    issueOfInterests: {type: GraphQLList(StakeholderIssueOfInterestType)},
    rating: {type: GraphQLInt},
    relevanceValue: {type: GraphQLFloat},
    relevanceWeightValue: {type: GraphQLFloat},
    weightValue: {type: GraphQLFloat},
  }),
})

const MaterialityIssueOfInterestType = new GraphQLObjectType({
  name: 'MaterialityIssueOfInterestType',
  fields: () => ({
    issueOfInterest: {type: new GraphQLNonNull(GraphQLString)},
    relevanceCompanyValue: {type: GraphQLFloat},
    relevanceStakeholdersValue: {type: GraphQLFloat},
    relevanceEmployeesValue: {type: GraphQLFloat},
    weightValue: {type: GraphQLFloat},
  }),
})

const MaterialityCoreSubjectType = new GraphQLObjectType({
  name: 'MaterialityCoreSubjectType',
  fields: () => ({
    coreSubject: {type: new GraphQLNonNull(GraphQLString)},
    issueOfInterests: {type: GraphQLList(MaterialityIssueOfInterestType)},
    relevanceCompanyValue: {type: GraphQLFloat},
    relevanceStakeholdersValue: {type: GraphQLFloat},
    relevanceEmployeesValue: {type: GraphQLFloat},
    weightValue: {type: GraphQLFloat},
  }),
})

const MaterialityStakeholderType = new GraphQLObjectType({
  name: 'MaterialityStakeholderType',
  fields: () => ({
    stakeholder: {
      type: require('./stakeholderType'),
      resolve(parentValue) {
        return Stakeholder.findById(parentValue.stakeholder).populate('stakeholder')
          .then(stakeholder => {
            return stakeholder
          })
      },
    },
    coreSubjects: {type: GraphQLList(StakeholderCoreSubjectType)},
    groupXFactor: {type: GraphQLFloat},
    credits: {type: GraphQLFloat},
    weightValue: {type: GraphQLFloat},
    isCompany: {type: GraphQLBoolean},
  }),
})


module.exports = {
  MaterialityStakeholderType,
  MaterialityCoreSubjectType,
}

