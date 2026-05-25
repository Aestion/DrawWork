module.exports = (sequelize, DataTypes) => {
  const YjsSnapshot = sequelize.define('YjsSnapshot', {
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
    content: {
      type: DataTypes.BLOB,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    created_by: {
      type: DataTypes.UUID,
      references: { model: 'users', key: 'id' }
    }
  }, {
    tableName: 'yjs_snapshots',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['canvas_id', 'created_at'] }
    ]
  })

  return YjsSnapshot
}
