module.exports.Response = (res, message, data=null, resCode = 400) => {
    res.statusCode = resCode;
    res.json({
        status: resCode > 201 ? 'error' : 'success',
        message: message,
        data: data,
    });
};
