const mongoose = require('mongoose')
const Schema = mongoose.Schema

const LogSchema = new Schema({
    path: {
        type: String,
        required: true,
    },
    reqBody: {
        type: Object,
        required: true,
    },
    resBody: {
        type: Object,
        required: true,
    },
    resCode: {
        type: Object,
        required: true,
    },
    duration: {
        type: Number,
        required: true,
    },  
    createdDate: {
        type: Date,
        default: Date.now,
    },
    activityDescription: {
        type: String,
    },
    types: [{
        type: String,
    }],
    userID: {
        type: Schema.Types.ObjectId,
        ref: 'user',
    },
})

const ModelClass = mongoose.model('logs', LogSchema)

module.exports = ModelClass