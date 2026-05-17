module.exports = (sequelize, DataTypes) => {
  const CommentReply = sequelize.define('CommentReply', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    comment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'comments', key: 'id' }
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' }
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    mentioned_user_id: {
      type: DataTypes.UUID,
      references: { model: 'users', key: 'id' }
    }
  }, {
    tableName: 'comment_replies',
    timestamps: true,
    underscored: true
  })

  return CommentReply
}
