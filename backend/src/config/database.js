const path = require('path')
const fs = require('fs')
const { Sequelize } = require('sequelize')

// Load config from root directory first, fallback to local
const rootEnv = path.resolve(__dirname, '../../../.env')
const localEnv = path.resolve(__dirname, '../../.env')
if (fs.existsSync(rootEnv)) {
  require('dotenv').config({ path: rootEnv })
  console.log('[Config] Loaded from root .env')
} else {
  require('dotenv').config({ path: localEnv })
  console.log('[Config] Loaded from local .env')
}

function createSqliteSequelize(storagePath, logging) {
  return new Sequelize({
    dialect: 'sqlite',
    storage: storagePath,
    logging
  })
}

function resolveSqliteStorage(rawUrl) {
  const target = rawUrl.replace(/^sqlite:/, '')
  if (!target || target === ':memory:') return target || ':memory:'
  return path.isAbsolute(target) ? target : path.resolve(__dirname, '..', '..', target)
}

function createSequelize() {
  const logging = process.env.NODE_ENV !== 'production' ? console.log : false

  // NODE_ENV=test 必须最先判断，防止 .env 中的 DATABASE_URL 劫持测试数据库
  if (process.env.NODE_ENV === 'test') {
    return createSqliteSequelize(':memory:', false)
  }

  const dbUrl = process.env.DATABASE_URL

  if (dbUrl && dbUrl.startsWith('sqlite:')) {
    return createSqliteSequelize(resolveSqliteStorage(dbUrl), logging)
  }

  const fallbackDbUrl = dbUrl || 'postgres://postgres:drawwork123@localhost:5432/drawwork'
  if (fallbackDbUrl.startsWith('sqlite:')) {
    return createSqliteSequelize(resolveSqliteStorage(fallbackDbUrl), logging)
  }

  return new Sequelize(fallbackDbUrl, {
    dialect: 'postgres',
    logging,
    dialectOptions: {
      ssl: false
    },
    pool: {
      max: 20,
      min: 5,
      acquire: 30000,
      idle: 10000
    }
  })
}

const sequelize = createSequelize()

async function testConnection() {
  try {
    await sequelize.authenticate()
    console.log(`[DB] Connection established (${sequelize.getDialect()})`)
  } catch (err) {
    console.error('[DB] Unable to connect:', err.message)
    throw err
  }
}

module.exports = { sequelize, testConnection }
