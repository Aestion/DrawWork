const { Notification } = require('../models')

const NOTIFICATION_TYPES = {
  BOARD_SHARE: 'board_share',
  COMMENT_REPLY: 'comment_reply',
  SHARE_LINK_JOIN: 'share_link_join',
  MENTION: 'mention'
}

async function createNotification({ userId, type, title, content, entityType, entityId }) {
  if (!userId || !type || !title) {
    console.warn('[notif] missing required fields', { userId, type, title })
    return null
  }
  try {
    const notification = await Notification.create({
      user_id: userId,
      type,
      title,
      content: content || null,
      entity_type: entityType || null,
      entity_id: entityId || null
    })
    return notification
  } catch (err) {
    console.error('[notif] failed to create notification:', err.message)
    return null
  }
}

module.exports = { createNotification, NOTIFICATION_TYPES }
