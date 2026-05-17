module.exports = (sequelize, DataTypes) => {
  const MindMap = sequelize.define('MindMap', {
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
    // Legacy field for backward compatibility
    root_node: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    // New multi-tree format
    roots: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    cross_connections: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    layout: {
      type: DataTypes.STRING(20),
      defaultValue: 'right',
      validate: {
        isIn: [['right', 'left', 'top', 'bottom', 'vertical']]
      }
    }
  }, {
    tableName: 'mind_maps',
    timestamps: true,
    underscored: true
  })

  return MindMap
}
