const Logger = require('../models/logs')
const {ACTIVITY_GRAPH} = require('../services/activites');
const ignorePaths = ['api/logs'];

function logger(req, res, next) {
    const path = req.originalUrl;
    const logTypes = {
        LOG: 'LOG',
        ACTIVITY: 'ACTIVITY',
    }
    
    // ignore this paths
    for (var keyward of ignorePaths){
        if (path.includes(keyward)){
            next();
            return;
        }
    }

    const selectedTypes = [logTypes.LOG];
    var type = null;
    var dict = null;
    if (path.includes('graphql')){
        type = req.body.operationName;
        if (type in ACTIVITY_GRAPH.GRAPHQL){
            dict = ACTIVITY_GRAPH.GRAPHQL[type];
        }
    }
    else if (path.includes('api')){
        type = req.method;
        if (path in ACTIVITY_GRAPH.API && type in ACTIVITY_GRAPH.API[path]){
            dict = ACTIVITY_GRAPH.API[path][type];
        }
    }

    if (dict) {
        selectedTypes.push(logTypes.ACTIVITY);
    }

    const {description} = dict ? dict : {description: '-'};
    const start = new Date();// process.hrtime()  
    
    var oldWrite = res.write,
        oldEnd = res.end;

    var chunks = [];    

    res.write = function (chunk) {
        chunks.push(chunk);

        return oldWrite.apply(res, arguments);
    };
    
    res.end = function (chunk) {
        try {
            // console.log("User:", req.user);

            if (chunk)
            chunks.push(chunk);
            
            var body = null;
            try {
                body = JSON.parse(Buffer.concat(chunks).toString('utf8'));                
            }catch (error) {
                body = {};
            }

            const durationInMilliseconds = new Date() - start;
            
            const object = {
                method: req.method,
                path: req.originalUrl,
                resCode: res.statusCode,
                reqBody: req.body ? req.body : {},
                resBody: body,
                duration: durationInMilliseconds,
                activityDescription: description,
                types: selectedTypes,
            };      

            if (typeof req.user === 'object') {
                object['userID'] = req.user._id
            }

            const loggerModel = new Logger(object)
            loggerModel.save((err) => {
                if (err) {
                    console.log("Error:", err);
                }
                else{
                    // console.log("Save");
                }
            })            
        } catch (error) {
            console.log("Logger Middleware error:", error.message)
        }
        finally {
            oldEnd.apply(res, arguments);        
        }
    };  
    next();        
}

function activityMiddleware(localValues, res, next) {
    res.locals = localValues;
    next();
}

module.exports.globalLogger = logger;
module.exports.activityMiddleware = activityMiddleware;

// User: {
//     _id: '5efc73e036e8d67fec6bddaf',
//     currentAgency: '5efc73e036e8d67fec6bddb0',
//     email: 'nviolaris@cellock.com',
//     password: '$2a$10$DN6iqhjkYfRjh/yh4ySqXeO/BpDOTVrN6npexYTFGL5cWDD6vp3MG',
//     name: 'Nikolas Violaris',
//     jobPosition: 'De',
//     __v: 0,
//     lang: 'en',
//     termsAndConditions: true,
//     companies: [],
//     date: '2020-07-01T11:30:40.722Z',
//     active: true,
//     role: 'Client',
//     agencies: [ '5efc73e036e8d67fec6bddb0' ]
//   }