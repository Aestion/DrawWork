const bcrypt = require('bcryptjs')
const { sequelize, User, Profile } = require('./src/models')

async function run() {
  console.log('=== 创建测试用户 123@qq.com ===')

  try {
    await sequelize.authenticate()
    console.log('✓ 数据库连接成功')

    const password_hash = await bcrypt.hash('123456', 10)

    // 创建用户
    const [user, created] = await User.findOrCreate({
      where: { email: '123@qq.com' },
      defaults: {
        username: '123',
        email: '123@qq.com',
        password_hash,
        is_active: true,
        is_admin: false
      }
    })

    if (created) {
      console.log('✓ 用户创建成功')
      console.log(`  用户名: ${user.username}`)
      console.log(`  邮箱: ${user.email}`)
      console.log(`  ID: ${user.id}`)
      console.log(`  密码: 123456`)

      // 创建 Profile
      await Profile.create({
        id: user.id,
        display_name: '123'
      })
      console.log('✓ Profile 创建成功')
    } else {
      console.log('✗ 用户已存在')
      console.log(`  用户名: ${user.username}`)
      console.log(`  ID: ${user.id}`)
    }

  } catch (err) {
    console.error('\n❌ 错误:', err.message)
    if (err.stack) console.error(err.stack)
  }

  await sequelize.close()
}

run()