const { sequelize, Board, User, BoardShare } = require('./src/models')

async function run() {
  console.log('=== 检查画板权限 ===')
  const boardId = 'a0f70a51-d7ce-4e8d-a5c4-6f1e78e9afa2'

  try {
    await sequelize.authenticate()
    console.log('✓ 数据库连接成功')

    // 查看所有用户
    const users = await User.findAll({ attributes: ['id', 'username', 'email'] })
    console.log('\n所有用户:')
    users.forEach(u => console.log(`- ${u.email} (${u.username}) | ID: ${u.id}`))

    // 查看指定画板
    const board = await Board.findByPk(boardId)
    if (board) {
      console.log(`\n画板信息: ID ${board.id}, Name ${board.name}, Owner ${board.owner_id}, Public ${board.is_public}`)

      // 查看 share
      const shares = await BoardShare.findAll({
        where: { board_id: boardId },
        include: [{ model: User, attributes: ['id', 'email', 'username'] }]
      })
      console.log(`\n画板分享信息 (${shares.length}条):`)
      shares.forEach(s => console.log(`- ${s.User?.email} | Permission ${s.permission}`))

    } else {
      console.log('\n✗ 画板不存在')
    }

  } catch (err) {
    console.error('\n❌ 错误:', err.message)
  }

  await sequelize.close()
}

run()