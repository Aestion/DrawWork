module.exports = (sequelize, DataTypes) => {
  const Comment = sequelize.define('Comment', {
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
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' }
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    x: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    y: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    is_resolved: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    tableName: 'comments',
    timestamps: true,
    underscored: true
  })

  return Comment
}
