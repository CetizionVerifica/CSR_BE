const { filter } = require('lodash');
const {Response} = require('../helpers/response');
const GapModel = require('../models/gapAnalysis');

exports.getGabAnalysisByIssueInterestAndProjectID = async function (req, res, next) {
    try {
        const projectID = req.params.projectID;
        const coreSubject = req.params.coreSubject;
        const issueOfInterest = req.params.issueOfInterest;
        const gapResult = await GapModel.findOne({project: projectID});
        const coreSubjects = filter(gapResult.coreSubjects, {'coreSubject': coreSubject});
        const keyConsiderations = filter(coreSubjects[0].issueOfInterests, {'issueOfInterest': issueOfInterest});
        return Response(res, '', keyConsiderations[0], 200);
    } catch (error) {
        console.log("Error:", error.message);
        return Response(res, error.message);
    }
}