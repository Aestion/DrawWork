module.exports = (sequelize, DataTypes) => {
  const BoardShare = sequelize.define('BoardShare', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    board_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'boards', key: 'id' }
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' }
    },
    permission: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [['editor', 'viewer', 'commenter']]
      }
    },
    invited_by: {
      type: DataTypes.UUID,
      references: { model: 'users', key: 'id' }
    },
    source: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'invite',
      validate: {
        isIn: [['invite', 'token']]
      }
    },
    share_token_id: {
      type: DataTypes.UUID,
      references: { model: 'share_tokens', key: 'id' },
      allowNull: true
    }
  }, {
    tableName: 'board_shares',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['board_id', 'user_id'] }
    ]
  })

  return BoardShare
}
