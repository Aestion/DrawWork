module.exports = (sequelize, DataTypes) => {
  const VoteRecord = sequelize.define('VoteRecord', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    vote_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'votes', key: 'id' }
    },
    user_id: {
      type: DataTypes.UUID,
      references: { model: 'users', key: 'id' }
    },
    session_id: {
      type: DataTypes.STRING(100)
    },
    target_id: {
      type: DataTypes.STRING(100),
      allowNull: false
    }
  }, {
    tableName: 'vote_records',
    timestamps: true,
    underscored: true,
    validate: {
      eitherUserOrSession() {
        if (!this.user_id && !this.session_id) {
          throw new Error('VoteRecord must have user_id or session_id')
        }
      }
    }
  })

  return VoteRecord
}
