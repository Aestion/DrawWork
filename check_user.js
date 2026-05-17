const { sequelize, User } = require('./backend/src/models')

async function run() {
  console.log('=== 正在检查数据库用户 ===')

  try {
    await sequelize.authenticate()
    console.log('✓ 数据库连接成功')

    const totalUsers = await User.count()
    console.log(`\n总用户数: ${totalUsers}`)

    const users = await User.findAll({
      attributes: ['id', 'username', 'email']
    })
    console.log('\n所有用户:')
    users.forEach(user => {
      console.log(`- ${user.email} (${user.username}) - ${user.id}`)
    })

    const targetUser = await User.findOne({ where: { email: '123@qq.com' } })
    console.log(`\n=== 检查用户 123@qq.com ===`)
    if (targetUser) {
      console.log(`✓ 用户存在`)
      console.log(`  用户名: ${targetUser.username}`)
      console.log(`  ID: ${targetUser.id}`)
      console.log(`  状态: ${targetUser.is_active ? '激活' : '禁用'}`)
    } else {
      console.log(`✗ 用户不存在`)
    }

  } catch (err) {
    console.error('\n❌ 错误:', err.message)
    if (err.stack) console.error(err.stack)
  }

  await sequelize.close()
}

run()