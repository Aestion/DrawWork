module.exports = (sequelize, DataTypes) => {
  const KanbanBoard = sequelize.define('KanbanBoard', {
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
    columns: {
      type: DataTypes.JSONB,
      allowNull: false
    },
    cards: {
      type: DataTypes.JSONB,
      allowNull: false
    }
  }, {
    tableName: 'kanban_boards',
    timestamps: true,
    underscored: true
  })

  return KanbanBoard
}
