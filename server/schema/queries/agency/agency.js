const getProjection = require('../../../helpers/getProjection')
const AgencyType = require('../../types/agencyType')
const AgencyModel = require('../../../models/agency')
const {checkAuth} = require('../../../services/checkAuth')

module.exports = {
  type: AgencyType,
  args: {
  },
  resolve(root, params, context, options) {
    checkAuth(context.isAuthenticated())

    const projection = getProjection(options.fieldNodes[0])

    let id = root.user.currentAgency
    if (!id) {
      throw new Error('Error  agency')
    }

    return AgencyModel
      .findById(id)
      .select(projection)
      .exec()
  },
}
