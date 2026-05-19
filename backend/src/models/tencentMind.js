module.exports = (sequelize, DataTypes) => {
  const TencentMind = sequelize.define('TencentMind', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    canvas_id: {
      type: DataTypes.UUID,
      unique: true,
      allowNull: false,
      references: { model: 'canvases', key: 'id' }
    },
    data: {
      type: DataTypes.JSONB,
      allowNull: true
    }
  }, {
    tableName: 'tencent_minds',
    timestamps: true,
    underscored: true
  })

  return TencentMind
}
