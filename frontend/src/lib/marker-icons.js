/**
 * Tencent Docs marker icon definitions for simple-mind-map icon system.
 * Maps Tencent marker types to SVG icons that render on nodes.
 */

export const questionIcon = `<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="10" fill="#f88825"/>
  <text x="12" y="16" text-anchor="middle" font-size="14" font-weight="bold" fill="#fff">?</text>
</svg>`

export const priorityIcon = `<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
  <rect x="4" y="3" width="16" height="18" rx="2" fill="#e74c3c"/>
  <text x="12" y="16" text-anchor="middle" font-size="12" font-weight="bold" fill="#fff">!</text>
</svg>`

export const progressIcon = `<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="10" fill="#3498db"/>
  <polygon points="12,6 12,12 17,14" fill="#fff"/>
</svg>`

export const starIcon = `<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
  <polygon points="12,2 15,9 22,9 16,14 18,22 12,17 6,22 8,14 2,9 9,9" fill="#f1c40f"/>
</svg>`

export const checkIcon = `<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="10" fill="#2ecc71"/>
  <polyline points="7,12 10,15 17,9" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

export const crossIcon = `<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="10" fill="#e74c3c"/>
  <line x1="8" y1="8" x2="16" y2="16" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
  <line x1="16" y1="8" x2="8" y2="16" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
</svg>`

export const ideaIcon = `<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="10" fill="#f39c12"/>
  <ellipse cx="12" cy="14" rx="4" ry="3" fill="#fff" opacity="0.9"/>
  <path d="M12 17v3M10 20h4" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M12 6v2M8.5 8.5l1.5 1.5M15.5 8.5l-1.5 1.5" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
</svg>`

export const warningIcon = `<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2L2 22h20L12 2z" fill="#e67e22"/>
  <line x1="12" y1="9" x2="12" y2="15" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
  <circle cx="12" cy="18" r="1" fill="#fff"/>
</svg>`

export const targetIcon = `<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="10" fill="#9b59b6"/>
  <circle cx="12" cy="12" r="6" fill="none" stroke="#fff" stroke-width="1.5"/>
  <circle cx="12" cy="12" r="2" fill="#fff"/>
</svg>`

export const clockIcon = `<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="10" fill="#1abc9c"/>
  <circle cx="12" cy="12" r="7" fill="none" stroke="#fff" stroke-width="1.2"/>
  <line x1="12" y1="8" x2="12" y2="12" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="12" y1="12" x2="15" y2="14" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
</svg>`

export const TENCENT_MARKER_ICONS = [
  {
    type: 'tencent',
    name: '腾讯标记',
    list: [
      { name: 'question', icon: questionIcon },
      { name: 'priority', icon: priorityIcon },
      { name: 'progress', icon: progressIcon },
      { name: 'star', icon: starIcon },
      { name: 'check', icon: checkIcon },
      { name: 'cross', icon: crossIcon },
      { name: 'idea', icon: ideaIcon },
      { name: 'warning', icon: warningIcon },
      { name: 'target', icon: targetIcon },
      { name: 'clock', icon: clockIcon }
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
    case 'symbol-star': return 'tencent_star'
    case 'symbol-check': return 'tencent_check'
    case 'symbol-cross': return 'tencent_cross'
    case 'symbol-idea': return 'tencent_idea'
    case 'symbol-warning': return 'tencent_warning'
    case 'symbol-target': return 'tencent_target'
    case 'symbol-clock': return 'tencent_clock'
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
    case 'tencent_star': return 'symbol-star'
    case 'tencent_check': return 'symbol-check'
    case 'tencent_cross': return 'symbol-cross'
    case 'tencent_idea': return 'symbol-idea'
    case 'tencent_warning': return 'symbol-warning'
    case 'tencent_target': return 'symbol-target'
    case 'tencent_clock': return 'symbol-clock'
    default: return null
  }
}
