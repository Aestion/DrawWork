const bcrypt = require('bcryptjs')

const TEST_BCRYPT_COST = 4

async function hashPassword(password) {
  return bcrypt.hash(password, TEST_BCRYPT_COST)
}

function generateUniqueEmail(prefix) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return `${prefix}-${suffix}@test.local`
}

module.exports = { hashPassword, generateUniqueEmail }
