const bcrypt = require('bcryptjs')
const { sequelize, User, Profile, Board, Canvas } = require('../backend/src/models')

async function init() {
  console.log('[Init] Starting...')
  await sequelize.sync()
  console.log('[Init] Database synced')

  // 检查是否已存在管理员
  const existingAdmin = await User.findOne({ where: { username: 'admin' } })
  if (existingAdmin) {
    console.log('[Init] Admin user already exists')
    process.exit(0)
  }

  // 创建管理员用户
  const passwordHash = await bcrypt.hash('admin123', 12)
  const admin = await User.create({
    username: 'admin',
    email: 'admin@company.local',
    password_hash: passwordHash,
    is_admin: true,
    is_active: true
  })
  console.log('[Init] Admin user created')

  // 创建用户资料
  await Profile.create({
    id: admin.id,
    display_name: 'Administrator',
    department: 'Engineering'
  })
  console.log('[Init] Admin profile created')

  // 创建示例画板
  const { v4: uuidv4 } = require('uuid')
  const board = await Board.create({
    owner_id: admin.id,
    name: '我的第一个画板',
    description: '这是一个示例画板，欢迎使用 DrawWork！',
    is_public: false
  })
  console.log('[Init] Example board created')

  // 创建画布
  await Canvas.create({
    board_id: board.id,
    name: '草稿本',
    type: 'excalidraw',
    sort_order: 0,
    yjs_room_id: 'board_' + board.id + '_canvas_' + uuidv4()
  })
  console.log('[Init] Canvas created')

  console.log('[Init] Done!')
  console.log('[Init] Login with: admin / admin123')
  process.exit(0)
}

init().catch(err => {
  console.error('[Init] Error:', err)
  process.exit(1)
})
