/**
 * Tencent Docs marker icon definitions for simple-mind-map icon system.
 * Maps Tencent marker types to SVG icons that render on nodes.
 */

const questionIcon = `<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="10" fill="#f88825"/>
  <text x="12" y="16" text-anchor="middle" font-size="14" font-weight="bold" fill="#fff">?</text>
</svg>`

const priorityIcon = `<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
  <rect x="4" y="3" width="16" height="18" rx="2" fill="#e74c3c"/>
  <text x="12" y="16" text-anchor="middle" font-size="12" font-weight="bold" fill="#fff">!</text>
</svg>`

const progressIcon = `<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="10" fill="#3498db"/>
  <polygon points="12,6 12,12 17,14" fill="#fff"/>
</svg>`

export const TENCENT_MARKER_ICONS = [
  {
    type: 'tencent',
    name: '腾讯标记',
    list: [
      { name: 'question', icon: questionIcon },
      { name: 'priority', icon: priorityIcon },
      { name: 'progress', icon: progressIcon }
    ]
  }
]

/**
 * Map a Tencent markerId to a simple-mind-map icon key.
 */
export function markerIdToIconKey(markerId) {
  switch (markerId) {
    case 'symbol-question': return 'tencent_question'
    case 'symbol-priority': return 'tencent_priority'
    case 'symbol-progress': return 'tencent_progress'
    default: return null
  }
}

/**
 * Map a simple-mind-map icon key back to a Tencent markerId.
 */
export function iconKeyToMarkerId(iconKey) {
  switch (iconKey) {
    case 'tencent_question': return 'symbol-question'
    case 'tencent_priority': return 'symbol-priority'
    case 'tencent_progress': return 'symbol-progress'
    default: return null
  }
}
