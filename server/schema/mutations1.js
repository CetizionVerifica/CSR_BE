const graphql = require('graphql')
const {GraphQLObjectType, GraphQLString, GraphQLBoolean, GraphQLInt, GraphQLID, GraphQLList} = graphql
const mongoose = require('mongoose')
const Song = mongoose.model('song')
const Lyric = mongoose.model('lyric')
const Company = mongoose.model('company')
const Employee = mongoose.model('employee')
const Stackholder = mongoose.model('stackholder')
const Project = mongoose.model('project')
const Materiality = mongoose.model('materiality')
const SongType = require('./songType')
const CompanyType = require('./companyType')
const ProjectType = require('./projectType')
const LyricType = require('./lyricType')
const EmployeeType = require('./employeeType')
const StackholderType = require('./stackholderType')
const MaterialityType = require('./materialityType')

const mutation = new GraphQLObjectType({
  name: 'Mutation',
  fields: {
  /*  company */
    addCompany: {
      type: CompanyType,
      args: {
        name: {type: GraphQLString},
        email: {type: GraphQLString},
        website: {type: GraphQLString},
        country: {type: GraphQLString},
        phone: {type: GraphQLString},
        fax: {type: GraphQLString},
        personName: {type: GraphQLString},
        jobPostion: {type: GraphQLString},
        personEmail: {type: GraphQLString},
        personPhone: {type: GraphQLString},
        personExtetion: {type: GraphQLString},
        personFax: {type: GraphQLString},
        lisence: {type: new GraphQLList(GraphQLString)},
      },
      resolve(parentValue, args) {
        return Company.addCompany(args)
      },
    },
    updateCompany: {
      type: CompanyType,
      args: {
        id: {type: GraphQLID},
        name: {type: GraphQLString},
        email: {type: GraphQLString},
        website: {type: GraphQLString},
        country: {type: GraphQLString},
        phone: {type: GraphQLString},
        fax: {type: GraphQLString},
        personName: {type: GraphQLString},
        jobPostion: {type: GraphQLString},
        personEmail: {type: GraphQLString},
        personPhone: {type: GraphQLString},
        personExtetion: {type: GraphQLString},
        personFax: {type: GraphQLString},
      },
      resolve(parentValue, args) {
        return Company.findByIdAndUpdate(args.id, args)
      },
    },
    deleteCompany: {
      type: CompanyType,
      args: {id: {type: GraphQLID}},
      resolve(parentValue, {id}) {
        return Company.remove({_id: id})
      },
    },
    /*  end of company */
    /*  supplier */
    requestSupplier: {
      type: CompanyType,
      args: {
        id: {type: GraphQLString},
        userId: {type: GraphQLString},
        agencyId: {type: GraphQLString},
        companyId: {type: GraphQLString},
        requestedYear: {type: GraphQLInt},
      },
      resolve(parentValue, args) {
        return Company.requestSupplier(args.id, args)
      },
    },
    /*  end of supplier */
    /*  project */
    addProject: {
      type: ProjectType,
      args: {
        title: {type: GraphQLString},
        companyId: {type: GraphQLID},
      },
      resolve(parentValue, {companyId, title}) {
        return Company.addProject(companyId, title)
      },
    },
    addMaterialityToProject: {
      type: ProjectType,
      args: {
        weight: {type: GraphQLInt},
        projectId: {type: GraphQLID},
        stackholderId: {type: GraphQLID},
      },
      resolve(parentValue, args) {
        return Project.addMateriality(args.projectId, args.stackholderId, args)
        //return
      },
    },
    /*  end of project */
    /*  employeee */
    addEmployeeToCompany: {
      type: CompanyType,
      args: {
        active: {type: GraphQLBoolean},
        name: {type: GraphQLString},
        jobPosition: {type: GraphQLString},
        email: {type: GraphQLString},
        phone: {type: GraphQLString},
        extention: {type: GraphQLString},
        fax: {type: GraphQLString},
        companyId: {type: GraphQLID},
      },
      resolve(parentValue, args) {
        return Company.addEmployee(args.companyId, args)
      },
    },
    updateEmployee: {
      type: EmployeeType,
      args: {
        id: {type: GraphQLID},
        active: {type: GraphQLBoolean},
        name: {type: GraphQLString},
        jobPosition: {type: GraphQLString},
        email: {type: GraphQLString},
        phone: {type: GraphQLString},
        extention: {type: GraphQLString},
        fax: {type: GraphQLString},
      },
      resolve(parentValue, args) {
        return Employee.findByIdAndUpdate(args.id, args)
      },
    },
    deleteEmployee: {
      type: EmployeeType,
      args: {id: {type: GraphQLID}},
      resolve(parentValue, {id}) {
        return Employee.remove({_id: id})
      },
    },
    /*  end of employeee */
    /*  stackholder */
    addStackholderToCompany: {
      type: CompanyType,
      args: {
        active: {type: GraphQLBoolean},
        companyName: {type: GraphQLString},
        name: {type: GraphQLString},
        jobPosition: {type: GraphQLString},
        email: {type: GraphQLString},
        phone: {type: GraphQLString},
        extention: {type: GraphQLString},
        fax: {type: GraphQLString},
        companyId: {type: GraphQLID},
      },
      resolve(parentValue, args) {
        return Company.addStackholder(args.companyId, args)
      },
    },
    updateStackholder: {
      type: StackholderType,
      args: {
        id: {type: GraphQLID},
        active: {type: GraphQLBoolean},
        companyName: {type: GraphQLString},
        name: {type: GraphQLString},
        jobPosition: {type: GraphQLString},
        email: {type: GraphQLString},
        phone: {type: GraphQLString},
        extention: {type: GraphQLString},
        fax: {type: GraphQLString},
      },
      resolve(parentValue, args) {
        return Stackholder.findByIdAndUpdate(args.id, args)
      },
    },
    deleteStackholder: {
      type: StackholderType,
      args: {id: {type: GraphQLID}},
      resolve(parentValue, {id}) {
        return Stackholder.remove({_id: id})
      },
    },
    /*  end of stackholder */

    addSong: {
      type: SongType,
      args: {
        title: {type: GraphQLString},
      },
      resolve(parentValue, {title}) {
        return (new Song({title})).save()
      },
    },
    addLyricToSong: {
      type: SongType,
      args: {
        content: {type: GraphQLString},
        songId: {type: GraphQLID},
      },
      resolve(parentValue, {content, songId}) {
        return Song.addLyric(songId, content)
      },
    },
    likeLyric: {
      type: LyricType,
      args: {id: {type: GraphQLID}},
      resolve(parentValue, {id}) {
        return Lyric.like(id)
      },
    },
    updateGapAnalysis: {
      type: ProjectType,
      args: {
        projectId: {type: GraphQLID},
        keyConsideration: {type: GraphQLString},
        companyPerformanceValue: {type: GraphQLInt},
        relevanceSignificanceValue: {type: GraphQLInt},
        coreSubject: {type: GraphQLString},
        isuueOfInterest: {type: GraphQLString},
        note: {type: GraphQLString},
      },
      resolve(parentValue, args) {
        return Project.keyConsideration(args.projectId, args)
      },
    },
    deleteSong: {
      type: SongType,
      args: {id: {type: GraphQLID}},
      resolve(parentValue, {id}) {
        return Song.remove({_id: id})
      },
    },
    updateMaterialityWeight: {
      type: MaterialityType,
      args: {
        weight: {type: GraphQLInt},
        id: {type: GraphQLID},
      },
      resolve(parentValue, args) {
        return Materiality.findByIdAndUpdate(args.id, args)
      },
    },
    updateMaterialityStackholderWeight: {
      type: MaterialityType,
      args: {
        id: {type: GraphQLID},
        weight: {type: GraphQLInt},
        coreSubject: {type: GraphQLString},
        isuueOfInterest: {type: GraphQLString},
        note: {type: GraphQLString},
      },
      resolve(parentValue, args) {
        return Materiality.isuueOfInterest(args.id, args)
      },
    },
  },
})

module.exports = mutation
