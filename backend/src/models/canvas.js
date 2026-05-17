module.exports = (sequelize, DataTypes) => {
  const Canvas = sequelize.define('Canvas', {
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
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: '画布 1'
    },
    type: {
      type: DataTypes.STRING(20),
      defaultValue: 'excalidraw',
      validate: {
        isIn: [['excalidraw', 'mindmap', 'kanban', 'swimlane']]
      }
    },
    sort_order: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    yjs_room_id: {
      type: DataTypes.STRING(100),
      unique: true,
      allowNull: false
    },
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    tableName: 'canvases',
    timestamps: true,
    underscored: true
  })

  return Canvas
}
