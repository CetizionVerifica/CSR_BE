const ACTIVITY_GRAPH = {
    // add paths
    API: {
        '/api/signin' : {
            POST: {
                description: 'User login',
            }
        },
        '/api/signup' : {
            POST: {
                description: 'User signup',
            }
        },
        '/api/sendMail' : {
            GET: {
                description: 'Send email',
            }
        }
    },
    // add graphql types
    GRAPHQL: {
        'UserType' : {
            description: 'Filter users',

        },
        'addSupplierRequest' : {
            description: 'Add supplier',
        },       
    }
}

module.exports.ACTIVITY_GRAPH = ACTIVITY_GRAPH;
