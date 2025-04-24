const {Response} = require('../helpers/response');
const ExternalSupplierModel = require('../models/externalSuppliers');
const AgencyModel = require('../models/agency');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

const GapAnalysis = require('../models/gapAnalysis');
exports.editExternalSupplier = async function (req, res, next) {
    try {
        // update by id
        let supplierid = req.params.supplierid;
        let result = await ExternalSupplierModel.findByIdAndUpdate(supplierid, req.body);                
      return Response(res, '', { _id: result._id }, 200);
    } catch (error) {
       return Response(res, error.message);
    }
}

exports.addExternalSupplier = async function (req, res, next) {
    console.log("User data:", JSON.stringify(req.user.currentAgency));
    try {
        const externalSupplier = new ExternalSupplierModel({
            assesmentPlatformMethod: req.body.assesmentPlatformMethod,  
            assesmentResult: req.body.assesmentResult,  
            engagementStatus: req.body.engagementStatus,   
            name: req.body.name,   
            phone: req.body.phone,   
            supplierCategory: req.body.supplierCategory,  
            supplierCategoryCoverage: req.body.supplierCategoryCoverage,     
            supplierEmail: req.body.supplierEmail,
            date: req.body.date,  
            supplierName: req.body.supplierName,
            companyID: req.body.companyID,
            compliance: req.body.compliance,
        });
        const result = await externalSupplier.save();                
      return Response(res, '', { _id: result._id }, 201);
    } catch (error) {
       return Response(res, error.message);
    }
}

exports.getExternalSuppliersByAgency = async function (req, res, next) {
    try {
        console.log("??", req.params.agencyID);
        // get companies
        const agencyData = await AgencyModel.findById(req.params.agencyID);
        const companies = agencyData.companies;

        // multiple OR operators
        const query = { 
            $or: companies.map(id => ({
                companyID: id,
            }))
        };
        const data = await ExternalSupplierModel.find(query);
        return Response(res, '', data, 200);
    } catch (error) {
        return Response(res, error.message);
    }
}

// exports.removeExternalSupplierByID = async function (req, res, next) {
//     try {
//         const data = await ExternalSupplierModel.findOneAndRemove({_id: req.params.id});        
//         return Response(res, null, {id: data._id}, 200);
//     } catch (error) {
//        return Response(res, error.message);
//     }
// }

exports.setHighSupplierConcern = async function (req, res, next) {
    try {
        const data = await ExternalSupplierModel.findByIdAndUpdate(req.body.id, {
            isHighConcern: req.body.isHighConcern,
        });        
        return Response(res, null, {id: data._id}, 200);
    } catch (error) {
       return Response(res, error.message);
    }
}

// getCompanyActivityLog =  async function(companyId) {
//     try {
//       // Validate companyId
//       if (!mongoose.Types.ObjectId.isValid(companyId)) {
//         throw new Error('Invalid company ID format');
//       }
      
//       // Convert string ID to ObjectId if needed
//       const objectId = typeof companyId === 'string' ? 
//         new mongoose.Types.ObjectId(companyId) : companyId;
//         console.log(objectId)
      
//       // Find all agencies related to this company
//       const agencies = await AgencyModel.find({
//         'users': objectId
//       }).select('_id name date updatedAt').lean();
      
//       // Format the activity log entries
//       const activityLog = agencies.map(agency => ({
//         entityType: 'Agency',
//         entityId: agency._id.toString(),
//         entityName: agency.name,
//         action: 'created',
//         timestamp: agency.date,
//         details: `Agency "${agency.name}" was created`
//       }));
      
//       // Sort by date (newest first)
//       activityLog.sort((a, b) => b.timestamp - a.timestamp);
      
//       console.log(activityLog)
//       return activityLog;
//     } catch (error) {
//       console.error('Error fetching company activity log:', error);
//       throw error;
//     }
//   }


getCompanyActivityLog = async function(companyId) {
    try {
      // Validate companyId
      if (!mongoose.Types.ObjectId.isValid(companyId)) {
        throw new Error('Invalid company ID format');
      }
      
      // Convert string ID to ObjectId if needed
      const objectId = typeof companyId === 'string' ? 
        new mongoose.Types.ObjectId(companyId) : companyId;
      console.log(objectId);
      
      // Find all agencies related to this company
      const agencies = await AgencyModel.find({
        'users': objectId
      }).select('_id name date updatedAt projects').lean();
      
      // Format the activity log entries
      const activityLog = [];
      
      // Add agency creation entries
      agencies.forEach(agency => {
        // Add agency creation entry
        activityLog.push({
          entityType: 'Agency',
          entityId: agency._id.toString(),
          entityName: agency.name,
          action: 'created',
          timestamp: agency.date,
          details: `Agency "${agency.name}" was created`
        });
        
        // Add projects if available
        if (agency.projects && agency.projects.length > 0) {
          agency.projects.forEach(projectId => {
            activityLog.push({
              entityType: 'Project',
              entityId: projectId.toString(),
              entityName: `Project in ${agency.name}`,
              action: 'added',
              timestamp: agency.updatedAt || agency.date, // Use updatedAt if available, otherwise use date
              details: `Project was added to agency "${agency.name}"`
            });
          });
        }
      });
      
      // Sort by date (newest first)
      activityLog.sort((a, b) => b.timestamp - a.timestamp);
      
      console.log(activityLog);
      return activityLog;
    } catch (error) {
      console.error('Error fetching company activity log:', error);
      throw error;
    }
  }
  
  // Express route handler
  exports.activityLogController =  function(req, res) {
    const { companyId } = req.params;
    console.log(companyId)
    getCompanyActivityLog(companyId)
      .then(logs => {
        const safeData = Array.isArray(logs) ? logs : [];
        res.status(200).json({
          success: true,
          data: safeData
        });
      })
      .catch(error => {
        res.status(400).json({
          success: false,
          message: error.message,
          data: []
        });
      });
  }

  // exports.getProjectsGapAnalysis = async (req, res) => {
  //   try {
  //     const { projectIds } = req.body;
      
  //     if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
  //       return res.status(400).json({
  //         success: false,
  //         message: 'Please provide valid project IDs'
  //       });
  //     }
      
  //     // Convert string IDs to ObjectId if needed
  //     const objectIdProjectIds = projectIds.map(id => {
  //       if (typeof id === 'string' && ObjectId.isValid(id)) {
  //         return new ObjectId(id);
  //       }
  //       return id;
  //     });
      
  //     // Find gap analysis documents for the provided project IDs
  //     const gapAnalysisData = await GapAnalysis.find({ 
  //       project: { $in: objectIdProjectIds } 
  //     })
  //     .populate('createdBy', 'firstName lastName email') // Adjust based on your User model
  //     .populate('updatedBy', 'firstName lastName email')
  //     .select('project coreSubjects createdBy updatedBy date updatedDate');
      
  //     // Transform data to include only necessary fields
  //     const transformedData = gapAnalysisData.map(analysis => {
  //       const simplifiedCoreSubjects = analysis.coreSubjects.map(subject => ({
  //         coreSubject: subject.coreSubject,
  //         performanceValue: subject.performanceValue,
  //         relevanceValue: subject.relevanceValue,
  //         totalKeyConsiderations: subject.totalKeyConsiderations
  //       }));
        
  //       return {
  //         projectId: analysis.project.toString(),
  //         coreSubjects: simplifiedCoreSubjects,
  //         createdBy: analysis.createdBy,
  //         updatedBy: analysis.updatedBy,
  //         date: analysis.date,
  //         updatedDate: analysis.updatedDate
  //       };
  //     });
      
  //     return res.status(200).json({
  //       success: true,
  //       data: transformedData
  //     });
      
  //   } catch (error) {
  //     console.error('Error fetching projects gap analysis:', error);
  //     return res.status(500).json({
  //       success: false,
  //       message: 'Failed to fetch gap analysis data',
  //       error: error.message
  //     });
  //   }
  // };


  exports.getProjectsGapAnalysis = async (req, res) => {
    try {
      const { projectIds } = req.body;
      
      if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Please provide valid project IDs'
        });
      }
      
      // Convert string IDs to ObjectId if needed
      const objectIdProjectIds = projectIds.map(id => {
        if (typeof id === 'string' && ObjectId.isValid(id)) {
          return new ObjectId(id);
        }
        return id;
      });
      
      // Find gap analysis documents for the provided project IDs
      const gapAnalysisData = await GapAnalysis.find({ 
        project: { $in: objectIdProjectIds } 
      })
      .populate('createdBy', 'name email _id') // Updated to match your user schema
      .populate('updatedBy', 'name email _id')  // Updated to match your user schema
      .select('project coreSubjects createdBy updatedBy date updatedDate');
      
      // Transform data to include only necessary fields
      const transformedData = gapAnalysisData.map(analysis => {
        const simplifiedCoreSubjects = analysis.coreSubjects.map(subject => ({
          coreSubject: subject.coreSubject,
          performanceValue: subject.performanceValue,
          relevanceValue: subject.relevanceValue,
          totalKeyConsiderations: subject.totalKeyConsiderations
        }));
        
        // Format createdBy and updatedBy to contain only id, name and email
        const formattedCreatedBy = analysis.createdBy ? {
          _id: analysis.createdBy._id,
          name: analysis.createdBy.name,
          email: analysis.createdBy.email
        } : null;
        
        const formattedUpdatedBy = analysis.updatedBy ? {
          _id: analysis.updatedBy._id,
          name: analysis.updatedBy.name,
          email: analysis.updatedBy.email
        } : null;
        
        return {
          projectId: analysis.project.toString(),
          coreSubjects: simplifiedCoreSubjects,
          createdBy: formattedCreatedBy,
          updatedBy: formattedUpdatedBy,
          date: analysis.date,
          updatedDate: analysis.updatedDate
        };
      });
      
      return res.status(200).json({
        success: true,
        data: transformedData
      });
      
    } catch (error) {
      console.error('Error fetching projects gap analysis:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch gap analysis data',
        error: error.message
      });
    }
  };