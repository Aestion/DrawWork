module.exports = (sequelize, DataTypes) => {
  const ShareToken = sequelize.define('ShareToken', {
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
    token: {
      type: DataTypes.STRING(100),
      unique: true,
      allowNull: false
    },
    raw_token: {
      type: DataTypes.STRING(100),
      unique: true,
      allowNull: true
    },
    permission: {
      type: DataTypes.STRING(20),
      defaultValue: 'viewer',
      validate: {
        isIn: [['editor', 'viewer', 'commenter']]
      }
    },
    expires_at: DataTypes.DATE,
    max_uses: DataTypes.INTEGER,
    used_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    is_revoked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    created_by: {
      type: DataTypes.UUID,
      references: { model: 'users', key: 'id' }
    }
  }, {
    tableName: 'share_tokens',
    timestamps: true,
    underscored: true
  })

  return ShareToken
}
