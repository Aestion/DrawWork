module.exports = (sequelize, DataTypes) => {
  const Swimlane = sequelize.define('Swimlane', {
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
    direction: {
      type: DataTypes.STRING(20),
      defaultValue: 'horizontal',
      validate: {
        isIn: [['horizontal', 'vertical']]
      }
    },
    lanes: {
      type: DataTypes.JSONB,
      allowNull: false
    },
    elements: {
      type: DataTypes.JSONB,
      allowNull: false
    }
  }, {
    tableName: 'swimlanes',
    timestamps: true,
    underscored: true
  })

  return Swimlane
}
