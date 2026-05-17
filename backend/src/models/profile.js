module.exports = (sequelize, DataTypes) => {
  const Profile = sequelize.define('Profile', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      references: { model: 'users', key: 'id' }
    },
    display_name: DataTypes.STRING(100),
    avatar_url: DataTypes.TEXT,
    department: DataTypes.STRING(100),
    phone: DataTypes.STRING(20)
  }, {
    tableName: 'profiles',
    timestamps: true,
    underscored: true
  })

  return Profile
}
