module.exports = (sequelize, DataTypes) => {
  const Vote = sequelize.define('Vote', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    canvas_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'canvases', key: 'id' }
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' }
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    votes_per_user: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    },
    is_anonymous: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    scope: {
      type: DataTypes.STRING(20),
      defaultValue: 'canvas',
      validate: {
        isIn: [['selection', 'canvas', 'region']]
      }
    },
    scope_data: {
      type: DataTypes.JSONB
    },
    expires_at: DataTypes.DATE,
    is_closed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    tableName: 'votes',
    timestamps: true,
    underscored: true
  })

  return Vote
}
