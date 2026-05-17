const { sequelize, Board, User, BoardShare } = require('./src/models')

async function run() {
  console.log('=== 分享画板给 321@qq.com ===')
  const boardId = 'a0f70a51-d7ce-4e8d-a5c4-6f1e78e9afa2'
  const user321Email = '321@qq.com'

  try {
    await sequelize.authenticate()
    console.log('✓ 数据库连接成功')

    // 查找用户
    const user321 = await User.findOne({ where: { email: user321Email } })
    if (!user321) {
      console.log(`✗ 用户 ${user321Email} 不存在`)
      return
    }

    // 查找画板
    const board = await Board.findByPk(boardId)
    if (!board) {
      console.log(`✗ 画板不存在`)
      return
    }

    // 查找或创建分享
    const [share, created] = await BoardShare.findOrCreate({
      where: { board_id: boardId, user_id: user321.id },
      defaults: {
        permission: 'editor',
        invited_by: board.owner_id
      }
    })

    if (created) {
      console.log(`✓ 分享成功！权限: ${share.permission}`)
    } else {
      console.log(`✓ 已存在分享记录！权限: ${share.permission}`)
    }

    // 再次测试权限
    const { getBoardPermission } = require('./src/middleware/permission')
    const { permission } = await getBoardPermission(boardId, user321.id)
    console.log(`权限检查: ${permission}`)

  } catch (err) {
    console.error('\n❌ 错误:', err)
  }

  await sequelize.close()
}

run()