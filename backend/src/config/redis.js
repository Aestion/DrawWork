const Redis = require('ioredis')

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000)
    return delay
  },
  lazyConnect: true
})

redis.on('connect', () => {
  console.log('[Redis] Connection established')
})

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message)
})

async function testRedisConnection() {
  if (process.env.NODE_ENV === 'test') {
    console.log('[Redis] Skipped in test mode')
    return
  }
  try {
    await redis.connect()
    await redis.ping()
    console.log('[Redis] Connection test passed')
  } catch (err) {
    console.error('[Redis] Unable to connect:', err.message)
    throw err
  }
}

module.exports = { redis, testRedisConnection }
