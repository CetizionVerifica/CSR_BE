const graphql = require('graphql')
const {
  GraphQLObjectType,
  GraphQLFloat,
  GraphQLID,
  GraphQLString,
  GraphQLBoolean,
  GraphQLList,
} = graphql
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')

const UserType = require('./userType')
const GapFileCriterionType = require('./gapFileCriterionType')
const UserModel = require('../../models/user')
const ProjectModel = require('../../models/project')

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

const GapFileType = new GraphQLObjectType({
  name: 'GapFileType',
  fields: () => ({
    id: {type: GraphQLID},
    project: {
      type: require('./projectType'),
      async resolve(gapFile) {
        return await ProjectModel.findById(gapFile.project).exec()
      },
    },
    path: {
      type: GraphQLString,
      async resolve(gapFile) {
        if (!gapFile.path) return null
        const command = new GetObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: gapFile.path,
        })
        return getSignedUrl(s3, command, { expiresIn: 3600 })
      },
    },
    assessmentComplete: {
      type: GraphQLBoolean,
    },
    keyConsiderations: {type: GraphQLList(GraphQLString)},
    criteria: {type: GraphQLList(GapFileCriterionType)},
    name: {
      type: GraphQLString,
    },
    uploadedBy: {
      type: UserType,
      async resolve(gapFile) {
        return await UserModel.findById(gapFile.updatedBy).exec()
      },
    },
    date: {
      type: GraphQLFloat,
      resolve({date}) {
        return date && date.getTime()
      },
    },
    updatedDate: {
      type: GraphQLFloat,
      resolve({updatedDate}) {
        return updatedDate && updatedDate.getTime()
      },
    },
  }),
})

module.exports = GapFileType
