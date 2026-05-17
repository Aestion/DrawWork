module.exports = (sequelize, DataTypes) => {
  const BoardVisit = sequelize.define('BoardVisit', {
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
    visited_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'board_visits',
    timestamps: false,
    underscored: true,
    indexes: [
      { unique: true, fields: ['board_id', 'user_id'] },
      { fields: ['user_id', 'visited_at'] }
    ]
  })

  return BoardVisit
}
