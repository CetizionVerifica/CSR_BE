const {Response} = require('../helpers/response');
const ExternalSupplierModel = require('../models/externalSuppliers');
const AgencyModel = require('../models/agency');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

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