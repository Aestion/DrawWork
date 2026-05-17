// Database utility functions
const { sequelize } = require('../config/database')

/**
 * Get database instance for raw queries
 * @returns {Sequelize} Sequelize instance
 */
function getDb() {
  return sequelize
}

/**
 * Execute raw SQL query
 * @param {string} query - SQL query
 * @param {object} replacements - Query replacements
 * @returns {Promise<Array>}
 */
async function query(query, replacements = {}) {
  const [results] = await sequelize.query(query, {
    replacements,
    type: sequelize.QueryTypes.SELECT
  })
  return results
}

/**
 * Execute raw SQL (insert/update/delete)
 * @param {string} query - SQL query
 * @param {object} replacements - Query replacements
 * @returns {Promise<object>}
 */
async function execute(query, replacements = {}) {
  const [results] = await sequelize.query(query, {
    replacements,
    type: sequelize.QueryTypes.RAW
  })
  return results
}

module.exports = {
  getDb,
  query,
  execute
}
