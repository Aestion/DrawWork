const { sequelize } = require('../config/database')
const { DataTypes } = require('sequelize')

// 导入所有模型
const User = require('./user')(sequelize, DataTypes)
const Profile = require('./profile')(sequelize, DataTypes)
const Board = require('./board')(sequelize, DataTypes)
const Canvas = require('./canvas')(sequelize, DataTypes)
const BoardShare = require('./boardShare')(sequelize, DataTypes)
const ShareToken = require('./shareToken')(sequelize, DataTypes)
const Comment = require('./comment')(sequelize, DataTypes)
const CommentReply = require('./commentReply')(sequelize, DataTypes)
const Vote = require('./vote')(sequelize, DataTypes)
const VoteRecord = require('./voteRecord')(sequelize, DataTypes)
const Notification = require('./notification')(sequelize, DataTypes)
const MindMap = require('./mindMap')(sequelize, DataTypes)
const KanbanBoard = require('./kanbanBoard')(sequelize, DataTypes)
const Swimlane = require('./swimlane')(sequelize, DataTypes)
const TencentMind = require('./tencentMind')(sequelize, DataTypes)
const File = require('./file')(sequelize, DataTypes)
const AuditLog = require('./auditLog')(sequelize, DataTypes)
const BoardVisit = require('./boardVisit')(sequelize, DataTypes)
const YjsSnapshot = require('./yjsSnapshot')(sequelize, DataTypes)

// 定义关联关系
User.hasOne(Profile, { foreignKey: 'id', onDelete: 'CASCADE' })
Profile.belongsTo(User, { foreignKey: 'id' })

User.hasMany(Board, { foreignKey: 'owner_id' })
Board.belongsTo(User, { foreignKey: 'owner_id', as: 'owner' })

Board.hasMany(Canvas, { foreignKey: 'board_id', onDelete: 'CASCADE' })
Canvas.belongsTo(Board, { foreignKey: 'board_id' })

Board.hasMany(BoardShare, { foreignKey: 'board_id', onDelete: 'CASCADE' })
BoardShare.belongsTo(Board, { foreignKey: 'board_id' })
BoardShare.belongsTo(User, { foreignKey: 'user_id' })

Board.hasMany(ShareToken, { foreignKey: 'board_id', onDelete: 'CASCADE' })
ShareToken.belongsTo(Board, { foreignKey: 'board_id' })

Canvas.hasMany(Comment, { foreignKey: 'canvas_id', onDelete: 'CASCADE' })
Comment.belongsTo(Canvas, { foreignKey: 'canvas_id' })
Comment.belongsTo(User, { foreignKey: 'user_id' })

Comment.hasMany(CommentReply, { foreignKey: 'comment_id', onDelete: 'CASCADE' })
CommentReply.belongsTo(Comment, { foreignKey: 'comment_id' })
CommentReply.belongsTo(User, { foreignKey: 'user_id' })

Canvas.hasMany(Vote, { foreignKey: 'canvas_id', onDelete: 'CASCADE' })
Vote.belongsTo(Canvas, { foreignKey: 'canvas_id' })
Vote.belongsTo(User, { foreignKey: 'created_by', as: 'creator' })

Vote.hasMany(VoteRecord, { foreignKey: 'vote_id', onDelete: 'CASCADE' })
VoteRecord.belongsTo(Vote, { foreignKey: 'vote_id' })

User.hasMany(Notification, { foreignKey: 'user_id', onDelete: 'CASCADE' })
Notification.belongsTo(User, { foreignKey: 'user_id' })

Canvas.hasOne(MindMap, { foreignKey: 'canvas_id', onDelete: 'CASCADE' })
MindMap.belongsTo(Canvas, { foreignKey: 'canvas_id' })

Canvas.hasOne(KanbanBoard, { foreignKey: 'canvas_id', onDelete: 'CASCADE' })
KanbanBoard.belongsTo(Canvas, { foreignKey: 'canvas_id' })

Canvas.hasOne(Swimlane, { foreignKey: 'canvas_id', onDelete: 'CASCADE' })
Swimlane.belongsTo(Canvas, { foreignKey: 'canvas_id' })

Canvas.hasOne(TencentMind, { foreignKey: 'canvas_id', onDelete: 'CASCADE' })
TencentMind.belongsTo(Canvas, { foreignKey: 'canvas_id' })

Board.hasMany(File, { foreignKey: 'board_id' })
File.belongsTo(Board, { foreignKey: 'board_id' })
File.belongsTo(User, { foreignKey: 'uploaded_by' })

User.hasMany(BoardVisit, { foreignKey: 'user_id', onDelete: 'CASCADE' })
BoardVisit.belongsTo(User, { foreignKey: 'user_id' })
Board.hasMany(BoardVisit, { foreignKey: 'board_id', onDelete: 'CASCADE' })
BoardVisit.belongsTo(Board, { foreignKey: 'board_id' })

Canvas.hasMany(YjsSnapshot, { foreignKey: 'canvas_id', onDelete: 'CASCADE' })
YjsSnapshot.belongsTo(Canvas, { foreignKey: 'canvas_id' })
YjsSnapshot.belongsTo(User, { foreignKey: 'created_by' })

module.exports = {
  sequelize,
  User,
  Profile,
  Board,
  Canvas,
  BoardShare,
  ShareToken,
  Comment,
  CommentReply,
  Vote,
  VoteRecord,
  Notification,
  MindMap,
  KanbanBoard,
  Swimlane,
  TencentMind,
  File,
  AuditLog,
  BoardVisit,
  YjsSnapshot
}
