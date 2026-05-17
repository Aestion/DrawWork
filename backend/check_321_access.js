const { sequelize, Board, User, BoardShare } = require('./src/models')

async function run() {
  console.log('=== 检查用户 321@qq.com 的访问权限 ===')
  const userEmail = '321@qq.com'
  const boardId = 'a0f70a51-d7ce-4e8d-a5c4-6f1e78e9afa2'

  try {
    await sequelize.authenticate()
    console.log('✓ 数据库连接成功')

    // 查找用户
    const user = await User.findOne({ where: { email: userEmail } })
    if (!user) {
      console.log(`✗ 用户 ${userEmail} 不存在`)
      return
    }
    console.log(`用户 ${user.email} (ID: ${user.id})`)

    // 查找画板
    const board = await Board.findByPk(boardId)
    if (!board) {
      console.log(`✗ 画板 ${boardId} 不存在`)
      return
    }
    console.log(`画板: ${board.name} (ID: ${board.id})`)
    console.log(`画板所有者: ${board.owner_id}`)
    console.log(`是否公开: ${board.is_public}`)

    // 检查 board_share 记录
    const share = await BoardShare.findOne({
      where: { board_id: boardId, user_id: user.id }
    })
    console.log(`分享权限记录:`, share ? share.permission : '无')

    // 测试权限函数
    const { getBoardPermission } = require('./src/middleware/permission')
    const { board: checkBoard, permission } = await getBoardPermission(boardId, user.id)
    console.log(`权限检查结果:`, permission)
    console.log(`画板信息是否一致:`, checkBoard ? true : false)

  } catch (err) {
    console.error('\n❌ 错误:', err)
  }

  await sequelize.close()
}

run()