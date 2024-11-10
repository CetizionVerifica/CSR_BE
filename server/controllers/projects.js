const {Response} = require('../helpers/response');
const ProjectModel = require('../models/project')

exports.getProjectsByYear =  async function(req, res, next) {
    try {
        const user = req.user;
        const result = await ProjectModel.find({agency: user.currentAgency, year: req.params.year});
        return Response(res, 'retrieve projects by year', result, 200);
    } catch (error) {   
        return Response(res, error.message);
    }   
};
