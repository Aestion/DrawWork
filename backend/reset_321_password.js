const bcrypt = require('bcryptjs')
const { sequelize, User } = require('./src/models')

async function run() {
  console.log('=== 重置 321@qq.com 密码 ===')

  try {
    await sequelize.authenticate()
    console.log('✓ 数据库连接成功')

    // 查找用户
    const user = await User.findOne({ where: { email: '321@qq.com' } })
    if (!user) {
      console.log('✗ 用户不存在')
      return
    }

    const newPasswordHash = await bcrypt.hash('123456', 10)
    await user.update({ password_hash: newPasswordHash })

    console.log('✓ 密码已重置成功')
    console.log(`用户: ${user.email}`)
    console.log(`新密码: 123456`)

  } catch (err) {
    console.error('\n❌ 错误:', err.message)
  }

  await sequelize.close()
}

run()