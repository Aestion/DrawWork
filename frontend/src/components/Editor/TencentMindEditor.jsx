import { useEffect, useRef, useState, forwardRef, useCallback } from 'react'
import { tencentToSimpleMindMap, simpleMindMapToTencent, DEFAULT_TENCENT_MIND } from '../../lib/tencent-mind-utils'
import UnbalancedLayoutPlugin from '../../lib/unbalanced-layout-plugin'
import { TENCENT_MARKER_ICONS, markerIdToIconKey, questionIcon, priorityIcon, progressIcon, starIcon, checkIcon, crossIcon, ideaIcon, warningIcon, targetIcon, clockIcon } from '../../lib/marker-icons'
import api from '../../lib/axios'
import { useTencentMindYjs } from '../../hooks/useTencentMindYjs'
import { useAuthStore } from '../../stores/authStore'

// Color palette for remote cursors
const CURSOR_COLORS = [
  '#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6',
  '#1ABC9C', '#E67E22', '#34495E', '#16A085', '#8E44AD'
]

function getUserColor(userId) {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i)
    hash |= 0
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length]
}

const LAYOUTS = [
  { value: 'logicalStructure', label: '逻辑结构' },
  { value: 'mindMap', label: '思维导图' },
  { value: 'catalogOrganization', label: '目录组织' },
  { value: 'organizationStructure', label: '组织结构' },
  { value: 'timeline', label: '时间线' },
  { value: 'fishbone', label: '鱼骨图' }
]

const THEMES = [
  'default', 'classic', 'classic2', 'dark',
  'blue', 'green', 'purple', 'red', 'orange', 'gold',
  'simple', 'fresh', 'fresh-blue', 'fresh-red'
]

const VIDEO_PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80"><rect width="120" height="80" fill="#e2e8f0" rx="6"/><circle cx="60" cy="40" r="16" fill="#64748b"/><polygon points="54,32 54,48 66,40" fill="#fff"/></svg>')
const INITIAL_DATA_CHANGE_SUPPRESS_MS = 800
const REMOTE_DATA_CHANGE_SUPPRESS_MS = 5000
const LOCAL_INTERACTION_GRACE_MS = 3000

function comparableTencentMindSnapshot(data) {
  if (!data) return ''
  return JSON.stringify({
    ...data,
    relationships: Array.isArray(data.relationships)
      ? data.relationships.map(({ id, ...relationship }) => relationship)
      : data.relationships
  })
}

export function shouldSkipTencentRemoteApply(remoteSnapshot, {
  remoteComparableSnapshot = '',
  lastBroadcastSnapshot = '',
  lastBroadcastComparableSnapshot = '',
  lastSavedSnapshot = '',
  lastSavedComparableSnapshot = '',
  lastAppliedRemoteSnapshot = '',
  lastAppliedRemoteComparableSnapshot = ''
} = {}) {
  return Boolean(
    remoteSnapshot &&
    (
      remoteSnapshot === lastBroadcastSnapshot ||
      remoteSnapshot === lastSavedSnapshot ||
      remoteSnapshot === lastAppliedRemoteSnapshot ||
      (remoteComparableSnapshot && remoteComparableSnapshot === lastBroadcastComparableSnapshot) ||
      (remoteComparableSnapshot && remoteComparableSnapshot === lastSavedComparableSnapshot) ||
      (remoteComparableSnapshot && remoteComparableSnapshot === lastAppliedRemoteComparableSnapshot)
    )
  )
}

export function applyNodeDataPatch(node, patch) {
  if (!node || !patch) return
  if (typeof node.setData === 'function') {
    Object.entries(patch).forEach(([key, value]) => {
      node.setData(key, value)
    })
  }
  if (node.nodeData?.data) Object.assign(node.nodeData.data, patch)
  if (node.data) Object.assign(node.data, patch)
}

function isFinitePoint(point) {
  return point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))
}

function normalizePoint(point) {
  return {
    ...point,
    x: Number(point?.x) || 0,
    y: Number(point?.y) || 0
  }
}

function computeDefaultControlPointOffsets(startPoint, endPoint) {
  const sp = normalizePoint(startPoint)
  const ep = normalizePoint(endPoint)
  let cx1 = sp.x + (ep.x - sp.x) / 2
  let cy1 = sp.y
  let cx2 = cx1
  let cy2 = ep.y
  if (Math.abs(sp.x - ep.x) <= 5) {
    cx1 = sp.x + (ep.y - sp.y) / 2
    cx2 = cx1
  }
  if (Math.abs(sp.y - ep.y) <= 5) {
    cx1 = sp.x
    cy1 = sp.y - (ep.x - sp.x) / 2
    cx2 = ep.x
    cy2 = cy1
  }
  return [
    { x: cx1 - sp.x, y: cy1 - sp.y },
    { x: cx2 - ep.x, y: cy2 - ep.y }
  ]
}

function normalizeControlOffsetEntry(entry, pointEntry) {
  if (Array.isArray(entry) && isFinitePoint(entry[0]) && isFinitePoint(entry[1])) {
    return [normalizePoint(entry[0]), normalizePoint(entry[1])]
  }
  return computeDefaultControlPointOffsets(pointEntry?.startPoint, pointEntry?.endPoint)
}

function isValidLinePointEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
  const hasStart = !entry.startPoint || isFinitePoint(entry.startPoint)
  const hasEnd = !entry.endPoint || isFinitePoint(entry.endPoint)
  return hasStart && hasEnd
}

export function normalizeAssociativeLineDataForNode(node) {
  if (!node?.getData) return false
  const targets = node.getData('associativeLineTargets')
  if (!Array.isArray(targets) || targets.length === 0) return false

  const offsetSource = node.getData('associativeLineTargetControlOffsets')
  const pointSource = node.getData('associativeLinePoint')
  const hasOffsetSource = Array.isArray(offsetSource)
  const hasPointSource = Array.isArray(pointSource)
  if (!hasOffsetSource && !hasPointSource) return false

  const offsets = Array.isArray(offsetSource) ? offsetSource.slice(0, targets.length) : []
  const points = Array.isArray(pointSource) ? pointSource.slice(0, targets.length) : []
  let changed = false

  for (let index = 0; index < targets.length; index += 1) {
    if (hasPointSource && !isValidLinePointEntry(points[index])) {
      points[index] = {}
      changed = true
    } else if (points[index]?.startPoint || points[index]?.endPoint) {
      points[index] = {
        ...points[index],
        ...(points[index].startPoint ? { startPoint: normalizePoint(points[index].startPoint) } : {}),
        ...(points[index].endPoint ? { endPoint: normalizePoint(points[index].endPoint) } : {})
      }
    }

    if (hasOffsetSource) {
      const normalizedOffset = normalizeControlOffsetEntry(offsets[index], points[index])
      const currentOffset = offsets[index]
      if (
        !Array.isArray(currentOffset) ||
        !isFinitePoint(currentOffset[0]) ||
        !isFinitePoint(currentOffset[1])
      ) {
        offsets[index] = normalizedOffset
        changed = true
      } else {
        offsets[index] = normalizedOffset
      }
    }
  }

  if (!changed) return false
  const patch = {}
  if (hasOffsetSource) patch.associativeLineTargetControlOffsets = offsets
  if (hasPointSource || hasOffsetSource) patch.associativeLinePoint = points
  applyNodeDataPatch(node, patch)
  return true
}

function walkMindMapNodes(root, visitor) {
  const walk = (treeNode) => {
    if (!treeNode) return
    visitor(treeNode._node || treeNode)
    if (Array.isArray(treeNode.children)) {
      treeNode.children.forEach(walk)
    }
  }
  walk(root)
}

export function normalizeAssociativeLineDataForMindMap(mindMap) {
  const root = mindMap?.renderer?.root || mindMap?.renderer?.renderTree
  if (!root) return false
  let changed = false
  walkMindMapNodes(root, node => {
    if (normalizeAssociativeLineDataForNode(node)) changed = true
  })
  return changed
}

export function canRunAssociativeLineControlDrag(instance) {
  if (!instance?.isControlPointMousedown) return false
  if (!Array.isArray(instance.activeLine) || instance.activeLine.length < 5) return false
  const [, , , node, toNode] = instance.activeLine
  if (!node || !toNode) return false
  return true
}

export function canCompleteAssociativeLineControlDrag(instance) {
  if (!canRunAssociativeLineControlDrag(instance)) return false
  const state = instance.controlPointMousemoveState || {}
  if (!state.pos || !state.startPoint || !state.endPoint) return false
  if (!Number.isInteger(Number(state.targetIndex)) || Number(state.targetIndex) < 0) return false
  return true
}

function resetAssociativeLineControlDrag(instance) {
  if (typeof instance?.resetControlPoint === 'function') {
    instance.resetControlPoint()
    return
  }
  if (!instance) return
  instance.isControlPointMousedown = false
  instance.mousedownControlPointKey = ''
  instance.controlPointMousemoveState = {
    pos: null,
    startPoint: null,
    endPoint: null,
    targetIndex: ''
  }
}

function isRecoverableAssociativeLineError(err) {
  return err instanceof TypeError &&
    /not iterable|Cannot read properties of null|Cannot read properties of undefined/.test(err.message)
}

function recoverAssociativeLineControlDrag(instance, err) {
  resetAssociativeLineControlDrag(instance)
  try {
    instance?.renderAllLines?.()
  } catch (renderErr) {
    console.warn('[TencentMind] Failed to redraw associative lines after recovering drag state:', renderErr)
  }
  if (isRecoverableAssociativeLineError(err)) {
    console.warn('[TencentMind] Recovered invalid associative line control drag state:', err)
    return
  }
  throw err
}

export function patchAssociativeLineInstance(instance) {
  if (!instance || instance.__drawworkControlDragPatch) return false
  const originalControlPointMousemove = instance.onControlPointMousemove
  const originalControlPointMouseup = instance.onControlPointMouseup
  if (typeof originalControlPointMousemove !== 'function' || typeof originalControlPointMouseup !== 'function') {
    return false
  }

  const patchedControlPointMousemove = function patchedControlPointMousemove(...args) {
    if (!canRunAssociativeLineControlDrag(this)) {
      resetAssociativeLineControlDrag(this)
      return
    }
    normalizeAssociativeLineDataForMindMap(this.mindMap)
    try {
      return originalControlPointMousemove.apply(this, args)
    } catch (err) {
      return recoverAssociativeLineControlDrag(this, err)
    }
  }.bind(instance)

  const patchedControlPointMouseup = function patchedControlPointMouseup(...args) {
    if (!this.isControlPointMousedown) return originalControlPointMouseup.apply(this, args)
    if (!canCompleteAssociativeLineControlDrag(this)) {
      resetAssociativeLineControlDrag(this)
      return
    }
    normalizeAssociativeLineDataForMindMap(this.mindMap)
    try {
      return originalControlPointMouseup.apply(this, args)
    } catch (err) {
      return recoverAssociativeLineControlDrag(this, err)
    }
  }.bind(instance)

  instance.mindMap?.off?.('mouseup', originalControlPointMouseup)
  instance.onControlPointMousemove = patchedControlPointMousemove
  instance.onControlPointMouseup = patchedControlPointMouseup
  instance.mindMap?.on?.('mouseup', instance.onControlPointMouseup)
  instance.__drawworkControlDragPatch = true
  return true
}

export function shouldRestoreTencentMindMediaNode(data, pendingVideoBlobs) {
  if (!data?._uploadId) return false
  if (data._mediaType === 'video') {
    return !String(data.image || '').startsWith('data:image/svg+xml') ||
      !data.imageSize ||
      !pendingVideoBlobs?.has?.(data._uploadId)
  }
  return !data.image || data.image === VIDEO_PLACEHOLDER || !data.imageSize
}

// Scan SVG DOM for VIDEO_PLACEHOLDER <image> elements and replace with <foreignObject><video>
const injectVideoPlaceholders = (containerEl, blobs, apiClient) => {
  const svg = containerEl?.querySelector('svg')
  if (!svg) return
  const svgNs = 'http://www.w3.org/2000/svg'
  const images = svg.querySelectorAll('image')
  for (const img of images) {
    const href = img.getAttribute('href') || img.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || ''
    if (href.slice(0, 30) !== VIDEO_PLACEHOLDER.slice(0, 30)) continue
    const g = img.closest('g')
    if (!g || g.querySelector('foreignObject[data-video]')) continue
    let blobUrl = g.dataset.videoBlobUrl || ''
    if (!blobUrl) {
      const uploadId = g.dataset.videoUploadId || ''
      if (uploadId && blobs.has(uploadId)) {
        blobUrl = blobs.get(uploadId)
      } else {
        for (const [uid, url] of blobs) {
          blobUrl = url
          g.dataset.videoUploadId = uid
          break
        }
      }
      if (blobUrl) g.dataset.videoBlobUrl = blobUrl
    }
    if (!blobUrl) continue
    const x = parseFloat(img.getAttribute('x')) || 0
    const y = parseFloat(img.getAttribute('y')) || 0
    const w = parseFloat(img.getAttribute('width')) || 120
    const h = parseFloat(img.getAttribute('height')) || 80
    const fo = document.createElementNS(svgNs, 'foreignObject')
    fo.setAttribute('data-video', 'true')
    fo.setAttribute('x', x)
    fo.setAttribute('y', y)
    fo.setAttribute('width', w)
    fo.setAttribute('height', h)
    fo.style.overflow = 'visible'
    const div = document.createElement('div')
    div.style.cssText = `width:${w}px;height:${h}px;line-height:0;`
    div.innerHTML = `<video src="${blobUrl}" muted loop autoplay playsinline style="width:100%;height:100%;object-fit:cover;border-radius:4px;display:block;"></video>`
    fo.appendChild(div)
    img.replaceWith(fo)
    // If blob URL fails (e.g. revoked after HMR), retry fetching from API
    const video = div.querySelector('video')
    const retryUploadId = g.dataset.videoUploadId
    if (video && retryUploadId && apiClient) {
      video.addEventListener('error', () => {
        apiClient.get(`/upload/${retryUploadId}`, { responseType: 'blob' }).then(res => {
          const newUrl = URL.createObjectURL(res.data)
          video.src = newUrl
          video.play().catch(() => {})
        }).catch(() => {})
      }, { once: true })
    }
  }
}

const TencentMindEditor = forwardRef(function TencentMindEditor({ canvasId, roomId, canEdit, boardId, onConnectionChange, isActive = true }, ref) {
  const containerRef = useRef(null)
  const mmRef = useRef(null)
  const originDataRef = useRef(null)
  const saveTimerRef = useRef(null)
  const activeNodeRef = useRef(null)
  const blobUrlsRef = useRef(new Set())
  const pendingVideoBlobsRef = useRef(new Map()) // uploadId → blobUrl
  const [loading, setLoading] = useState(true)
  const [currentLayout, setCurrentLayout] = useState('mindMap')
  const [currentTheme, setCurrentTheme] = useState('default')
  const [readonly, setReadonly] = useState(false)
  const [linkMode, setLinkMode] = useState(false)
  const linkModeRef = useRef(false)
  const linkSourceRef = useRef(null)
  const pluginsRegisteredRef = useRef(false)
  const prevCanvasIdRef = useRef(canvasId)
  const lastAppliedVersionRef = useRef(0)
  const lastRemoteAppliedVersionRef = useRef(0)
  const saveDataRef = useRef(null)
  const remoteUpdateCountRef = useRef(0)
  const applyingRemoteUpdateRef = useRef(false)
  const hasPendingLocalSaveRef = useRef(false)
  const ignoreDataChangeUntilRef = useRef(0)
  const localInteractionUntilRef = useRef(0)
  const lastAppliedRemoteSnapshotRef = useRef('')
  const lastAppliedRemoteComparableSnapshotRef = useRef('')
  const lastSavedSnapshotRef = useRef('')
  const lastSavedComparableSnapshotRef = useRef('')
  const lastBroadcastSnapshotRef = useRef('')
  const lastBroadcastComparableSnapshotRef = useRef('')
  const [contextMenu, setContextMenu] = useState(null)
  const contextNodeRef = useRef(null)
  const markerMenuRef = useRef(null)
  const setContextMenuRef = useRef(setContextMenu)

  // Get auth token and user from store (consistent with MindMapEditor)
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)

  const {
    tencentData: yjsTencentData,
    loading: yjsLoading,
    connected,
    synced,
    onlineCount,
    remoteUpdateVersion,
    syncToYjs,
    updateAwareness,
    getAwarenessStates
  } = useTencentMindYjs({ canvasId, roomId, token, canEdit })

  // Sync Yjs data to originDataRef (initial load and remote updates)
  useEffect(() => {
    if (!yjsTencentData || yjsLoading) return
    // Always update originDataRef so the init effect has the latest data.
    // The early-return only skips the version bump + setLoading when data hasn't changed,
    // but originDataRef must stay current so mind map recreation uses fresh data.
    if (lastAppliedVersionRef.current === remoteUpdateVersion && originDataRef.current) {
      originDataRef.current = yjsTencentData
      return
    }
    originDataRef.current = yjsTencentData
    lastAppliedVersionRef.current = remoteUpdateVersion
    setLoading(false)
  }, [yjsTencentData, remoteUpdateVersion, yjsLoading])

  // Handle canvas change
  useEffect(() => {
    if (prevCanvasIdRef.current !== canvasId) {
      prevCanvasIdRef.current = canvasId
      originDataRef.current = null
      lastAppliedVersionRef.current = 0
      lastRemoteAppliedVersionRef.current = 0
      setLoading(true)
    }
  }, [canvasId])

  // ── Restoration helpers (shared by onFirstRender and remote-update effect) ──

  function restoreAssociativeLines(mindMap, originData) {
    const relationships = originData?.relationships || []
    if (relationships.length === 0) return
    const buildNodeIdMap = (dataNode) => {
      const map = new Map()
      const walk = (n) => {
        const node = n._node || n
        const id = node?.nodeData?.data?._tencentMeta?.id
        if (id) map.set(id, node)
        if (n.children) n.children.forEach(c => walk(c))
      }
      walk(dataNode)
      return map
    }
    const nodeMap = buildNodeIdMap(mindMap.renderer.renderTree)
    for (const rel of relationships) {
      const fromNode = nodeMap.get(rel.end1Id)
      const toNode = nodeMap.get(rel.end2Id)
      if (!fromNode || !toNode) continue
      mindMap.associativeLine?.addLine(fromNode, toNode)
      if (rel.title) {
        try {
          const toUid = toNode.getData('uid')
          const allText = fromNode.getData('associativeLineText') || {}
          allText[toUid] = rel.title
          mindMap.execCommand('SET_NODE_DATA', fromNode, { associativeLineText: allText })
        } catch (e) {
          console.error('Failed to restore line text:', e)
        }
      }
      if (rel.controlPoints && Object.keys(rel.controlPoints).length > 0) {
        try {
          const toUid = toNode.getData('uid')
          const targets = fromNode.getData('associativeLineTargets') || []
          const idx = targets.indexOf(toUid)
          if (idx >= 0) {
            const sp = rel.lineEndPoints?.["0"] || {}
            const ep = rel.lineEndPoints?.["1"] || {}
            const cp0 = rel.controlPoints["0"] || {}
            const cp1 = rel.controlPoints["1"] || {}
            const offsets = [
              { x: (cp0.x || 0) - (sp.x || 0), y: (cp0.y || 0) - (sp.y || 0) },
              { x: (cp1.x || 0) - (ep.x || 0), y: (cp1.y || 0) - (ep.y || 0) }
            ]
            const allOffsets = fromNode.getData('associativeLineTargetControlOffsets') || []
            allOffsets[idx] = offsets
            fromNode.setData('associativeLineTargetControlOffsets', allOffsets)
            const allPoints = fromNode.getData('associativeLinePoint') || []
            allPoints[idx] = { startPoint: sp, endPoint: ep }
            fromNode.setData('associativeLinePoint', allPoints)
          }
        } catch (e) {
          console.error('Failed to restore control points:', e)
        }
      }
      if (rel.style && rel.style.lineColor) {
        try {
          const toUid = toNode.getData('uid')
          const allStyles = fromNode.getData('associativeLineStyle') || {}
          allStyles[toUid] = {
            associativeLineColor: rel.style.lineColor,
            ...(rel.style.lineWidth != null ? { associativeLineWidth: rel.style.lineWidth } : {}),
            ...(rel.style.lineDasharray != null ? { associativeLineDasharray: rel.style.lineDasharray } : {})
          }
          fromNode.setData('associativeLineStyle', allStyles)
        } catch (e) {
          console.error('Failed to restore line style:', e)
        }
      }
    }
    normalizeAssociativeLineDataForMindMap(mindMap)
    mindMap.associativeLine?.renderAllLines?.()
  }

  function restoreGeneralizations(mindMap, originData) {
    const preserved = []
    const walk = (node, depth = 0) => {
      const mn = node._node || node
      const meta = mn?.nodeData?.data?._tencentMeta
      const genData = meta?.extensions?.['drawwork.generalization']
      if (genData && genData.length > 0) {
        const range = genData[0].range
        if (range && mn.children) {
          const targetChildren = mn.children.slice(range[0], range[1] + 1)
          const nodeInstances = targetChildren.map(n => n._node).filter(Boolean)
          if (nodeInstances.length > 0) {
            mindMap.renderer.activeNodeList = nodeInstances
            mindMap.execCommand('ADD_GENERALIZATION', { text: genData[0].text || '概要' })
            try {
              mn.setData?.('generalization', genData)
              if (mn.nodeData?.data) mn.nodeData.data.generalization = genData
              if (mn.data) mn.data.generalization = genData
            } catch (e) {
              console.error('Failed to preserve generalization data:', e)
            }
            preserved.push({ node: mn, genData })
          }
        } else if (!range) {
          try {
            mindMap.execCommand('SET_NODE_DATA', mn, { generalization: genData })
            preserved.push({ node: mn, genData })
          } catch (e) {
            console.error('Failed to restore self-generalization:', e)
          }
        }
      }
      if (node.children) node.children.forEach(c => walk(c, depth + 1))
    }
    walk(mindMap.renderer.renderTree, 0)
    mindMap.render(() => {
      preserved.forEach(({ node, genData }) => {
        try {
          node.setData?.('generalization', genData)
          if (node.nodeData?.data) node.nodeData.data.generalization = genData
          if (node.data) node.data.generalization = genData
        } catch (e) {
          console.error('Failed to preserve generalization after render:', e)
        }
      })
    })
  }

  function restoreBoundaries(mindMap, originData) {
    const boundaryList = originData?.rootTopic?.boundaries
    const rootChildren = mindMap.renderer.renderTree?.children
    if (!boundaryList || boundaryList.length === 0 || !rootChildren) return
    for (const boundary of boundaryList) {
      const [start, end] = boundary.range || [0, 0]
      const targetChildren = rootChildren.slice(start, end + 1)
      if (targetChildren.length > 0) {
        const nodeInstances = targetChildren.map(n => n._node).filter(Boolean)
        if (nodeInstances.length > 0) {
          mindMap.renderer.activeNodeList = nodeInstances
          mindMap.execCommand('ADD_OUTER_FRAME', null, {
            strokeColor: boundary.strokeColor || '#0984e3',
            fill: boundary.fill || 'rgba(9,132,227,0.05)',
            radius: boundary.radius || 5,
            strokeWidth: boundary.strokeWidth || 2,
            strokeDasharray: boundary.strokeDasharray || '0'
          })
        }
      }
    }
  }

  function restoreAllMarkers(mindMap, originData) {
    const walk = (node) => {
      const mn = node._node || node
      const meta = mn?.nodeData?.data?._tencentMeta
      if (meta?.markers?.length) {
        const iconKeys = meta.markers.map(m => markerIdToIconKey(m.markerId)).filter(Boolean)
        if (iconKeys.length) {
          mn.setIcon(iconKeys)
        }
      }
      if (node.children) node.children.forEach(walk)
    }
    walk(mindMap.renderer.renderTree)
  }

  function overlaySimpleNodeDataByTencentId(mindMap, smmData) {
    const dataById = new Map()
    const collect = (node) => {
      const id = node?.data?._tencentMeta?.id
      if (id) dataById.set(id, node.data)
      if (node?.children) node.children.forEach(collect)
    }
    collect(smmData)

    const apply = (node) => {
      const mn = node._node || node
      const targetData = mn?.nodeData?.data || mn?.data
      const id = targetData?._tencentMeta?.id
      const sourceData = id ? dataById.get(id) : null
      if (targetData && sourceData) {
        ;['icon', 'generalization', 'outerFrame'].forEach(key => {
          if (sourceData[key] !== undefined) {
            targetData[key] = sourceData[key]
            mn.setData?.(key, sourceData[key])
          }
        })
      }
      if (node.children) node.children.forEach(apply)
    }
    apply(mindMap.renderer.renderTree)
  }

  function applyRemoteDataInPlace(mindMap, smmData, tencentData) {
    const currentById = new Map()
    const walkCurrent = (node) => {
      const realNode = node?._node || node?.data?._node || node
      const data = realNode?.nodeData?.data || realNode?.data || {}
      const id = data?._tencentMeta?.id
      if (id) currentById.set(id, realNode)
      ;(node?.children || []).forEach(walkCurrent)
    }
    walkCurrent(mindMap.renderer.renderTree)

    const incomingById = new Map()
    const walkIncoming = (node) => {
      const id = node?.data?._tencentMeta?.id
      if (id) incomingById.set(id, node)
      ;(node?.children || []).forEach(walkIncoming)
    }
    walkIncoming(smmData)

    if (currentById.size !== incomingById.size) return false
    for (const id of incomingById.keys()) {
      if (!currentById.has(id)) return false
    }

    incomingById.forEach((incoming, id) => {
      const node = currentById.get(id)
      const targetData = node?.nodeData?.data || node?.data
      const sourceData = incoming.data || {}
      if (!targetData) return

      if (sourceData.text !== undefined && node.getData?.('text') !== sourceData.text && typeof node.setText === 'function') {
        node.setText(sourceData.text, sourceData.richText, sourceData.resetRichText)
      } else if (sourceData.text !== undefined) {
        targetData.text = sourceData.text
      }

      ;['icon', 'generalization', 'outerFrame', '_uploadId', '_mediaType', '_imageSize'].forEach(key => {
        if (sourceData[key] !== undefined) {
          targetData[key] = sourceData[key]
          if (typeof node.setData === 'function') node.setData(key, sourceData[key])
        } else if (key in targetData) {
          delete targetData[key]
        }
      })
    })

    overlaySimpleNodeDataByTencentId(mindMap, smmData)
    try { restoreAssociativeLines(mindMap, tencentData) } catch (e) { console.error('Remote restore associative lines:', e) }
    try { restoreGeneralizations(mindMap, tencentData) } catch (e) { console.error('Remote restore generalizations:', e) }
    try { restoreBoundaries(mindMap, tencentData) } catch (e) { console.error('Remote restore boundaries:', e) }
    try { restoreAllMarkers(mindMap, tencentData) } catch (e) { console.error('Remote restore markers:', e) }
    restoreNodeMedia(mindMap).catch(e => console.error('Remote restore media:', e))
    return true
  }

  async function restoreNodeMedia(mindMap) {
    let changed = false
    const walk = async (node) => {
      const realNode = node?._node || node
      const data = realNode?.nodeData?.data || realNode?.data
      if (data?._uploadId) {
        if (!shouldRestoreTencentMindMediaNode(data, pendingVideoBlobsRef.current)) {
          if (data._mediaType === 'video') {
            injectVideoPlaceholders(containerRef.current, pendingVideoBlobsRef.current, api)
          }
        } else {
        const uploadId = data._uploadId
        const mediaType = data._mediaType
        try {
          const blobRes = await api.get(`/upload/${uploadId}`, { responseType: 'blob' })
          const blobUrl = URL.createObjectURL(blobRes.data)
          blobUrlsRef.current.add(blobUrl)
          if (mediaType === 'video') {
            pendingVideoBlobsRef.current.set(uploadId, blobUrl)
            const imageSize = data._imageSize || { width: 120, height: 80, custom: true }
            mindMap.execCommand('SET_NODE_IMAGE', realNode, {
              url: VIDEO_PLACEHOLDER,
              width: imageSize.width,
              height: imageSize.height,
              custom: imageSize.custom ?? true
            })
            data.image = VIDEO_PLACEHOLDER
            data.imageSize = imageSize
          } else {
            const imageSize = data._imageSize || { width: 200, height: 150, custom: true }
            mindMap.execCommand('SET_NODE_IMAGE', realNode, {
              url: blobUrl,
              width: imageSize.width,
              height: imageSize.height,
              custom: imageSize.custom ?? true
            })
            data.image = blobUrl
            data.imageSize = imageSize
          }
          changed = true
        } catch (err) {
          console.error('Failed to restore media:', err)
        }
        }
      }
      if (node.children) {
        for (const child of node.children) {
          await walk(child)
        }
      }
    }
    await walk(mindMap.renderer.renderTree)
    if (changed) {
      mindMap.render(() => {
        injectVideoPlaceholders(containerRef.current, pendingVideoBlobsRef.current, api)
      })
    } else {
      injectVideoPlaceholders(containerRef.current, pendingVideoBlobsRef.current, api)
    }
  }

  // Initialize simple-mind-map
  useEffect(() => {
    if (!containerRef.current || !isActive || loading) return
    let mounted = true
    let mindMap = null
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setContextMenuRef.current(null)
    }
    const markLocalInteraction = () => {
      localInteractionUntilRef.current = Date.now() + LOCAL_INTERACTION_GRACE_MS
    }

    // Clear stale blob URLs from previous init (e.g. on remoteUpdateVersion change)
    blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
    blobUrlsRef.current.clear()
    pendingVideoBlobsRef.current.clear()

    const init = async () => {
      const [MindMapModule, DragModule, AssociativeLineModule, OuterFrameModule, RichTextModule, SelectModule] = await Promise.all([
        import('simple-mind-map'),
        import('simple-mind-map/src/plugins/Drag.js'),
        import('simple-mind-map/src/plugins/AssociativeLine.js'),
        import('simple-mind-map/src/plugins/OuterFrame.js'),
        import('simple-mind-map/src/plugins/RichText.js'),
        import('simple-mind-map/src/plugins/Select.js')
      ])
      const MindMap = MindMapModule.default
      if (!mounted) return

      const DragClass = DragModule.default

      // 重载 getNodeDistanceToSiblingNode：一级节点跨侧兄弟偏移量为负
      // （左右侧节点同一高度重叠）时，硬编码 60px 放置区，不使用 minOffset
      // 避免 minOffset 增大影响同侧半距计算逻辑
      const origGetDist = DragClass.prototype.getNodeDistanceToSiblingNode
      DragClass.prototype.getNodeDistanceToSiblingNode = function(checkList, node, nodeRect, direction) {
        const result = origGetDist.call(this, checkList, node, nodeRect, direction)
        if (node.layerIndex === 1) {
          const scale = direction === 'v'
            ? (this.drawTransform?.scaleY || 1)
            : (this.drawTransform?.scaleX || 1)
          const edgeDropZone = 60 * scale  // 硬编码 60px，不依赖 minOffset
          if (result.prevBrother && result.prevBrotherOffset < 0) {
            result.prevBrotherOffset = edgeDropZone
            result.prevBrother = null
          }
          if (result.nextBrother && result.nextBrotherOffset < 0) {
            result.nextBrotherOffset = edgeDropZone
            result.nextBrother = null
          }
        }
        return result
      }

      // Monkey-patch: 保留所有兄弟参与检查，增加边缘前置检测
      // 当光标在全部一级节点最上方/最下方 60px 时，跳过水平边界检查直接触发
      // 解决跨侧拖拽时光标不在目标节点水平范围内的问题
      DragClass.prototype.handleMindMap = function(node) {
        const checkList = node.parent
          ? node.parent.children.filter(item => {
              return !this.checkIsInBeingDragNodeList(item)
            })
          : []

        // 边缘前置检测：仅对一级节点，在所有节点之上/之下触发
        // 按光标 X 位置判断目标侧，优先检查距离更近的一侧
        if (node.layerIndex === 1 && !this.overlapNode && !this.prevNode && !this.nextNode && checkList.length > 0) {
          const cursorY = this.mouseMoveY
          const cursorX = this.mouseMoveX
          const edgeZone = 60
          const rootCenter = node.parent ? (node.parent.left || 0) + (node.parent.width || 0) / 2 : 0

          const leftSide = checkList.filter(n => n.data?.dir === 'left').sort((a, b) => (a.top || 0) - (b.top || 0))
          const rightSide = checkList.filter(n => n.data?.dir === 'right').sort((a, b) => (a.top || 0) - (b.top || 0))

          // 光标偏左先检左，偏右先检右
          const sides = cursorX < rootCenter
            ? [leftSide, rightSide]
            : [rightSide, leftSide]

          for (const side of sides) {
            if (side.length === 0) continue
            const first = side[0]
            const last = side[side.length - 1]
            if (cursorY < (first.top ?? -Infinity) && cursorY >= (first.top ?? -Infinity) - edgeZone) {
              this.nextNode = first
              return
            }
            if (cursorY > (last.bottom ?? Infinity) && cursorY <= (last.bottom ?? Infinity) + edgeZone) {
              this.prevNode = last
              return
            }
          }
        }

        this.handleVerticalCheck(node, checkList)
      }

      const AssociativeLineClass = AssociativeLineModule.default || AssociativeLineModule
      if (AssociativeLineClass && !AssociativeLineClass.__drawworkNormalizePatch) {
        const originalRenderAllLines = AssociativeLineClass.prototype.renderAllLines
        const originalControlPointMousemove = AssociativeLineClass.prototype.onControlPointMousemove
        const originalControlPointMouseup = AssociativeLineClass.prototype.onControlPointMouseup

        AssociativeLineClass.prototype.renderAllLines = function patchedRenderAllLines(...args) {
          normalizeAssociativeLineDataForMindMap(this.mindMap)
          return originalRenderAllLines.apply(this, args)
        }

        AssociativeLineClass.prototype.onControlPointMousemove = function patchedControlPointMousemove(...args) {
          return patchAssociativeLineInstance(this)
            ? this.onControlPointMousemove(...args)
            : originalControlPointMousemove.apply(this, args)
        }

        AssociativeLineClass.prototype.onControlPointMouseup = function patchedControlPointMouseup(...args) {
          return patchAssociativeLineInstance(this)
            ? this.onControlPointMouseup(...args)
            : originalControlPointMouseup.apply(this, args)
        }

        AssociativeLineClass.__drawworkNormalizePatch = true
      }

      if (!MindMap._tencentPluginsRegistered) {
        MindMap.usePlugin(DragClass)
        MindMap.usePlugin(AssociativeLineClass)
        MindMap.usePlugin(UnbalancedLayoutPlugin)
        MindMap.usePlugin(OuterFrameModule.default || OuterFrameModule)
        MindMap.usePlugin(RichTextModule.default || RichTextModule)
        MindMap.usePlugin(SelectModule.default || SelectModule)
        MindMap._tencentPluginsRegistered = true
      }

      const rawData = originDataRef.current
      const smmData = tencentToSimpleMindMap(rawData)
      mindMap = new MindMap({
        el: containerRef.current,
        data: smmData,
        layout: currentLayout,
        theme: currentTheme,
        readonly,
        fit: true,
        enableFreeDrag: false,
        useLeftKeySelectionRightKeyDrag: true,
        iconList: TENCENT_MARKER_ICONS
      })
      mmRef.current = mindMap
      patchAssociativeLineInstance(mindMap.associativeLine)
      if (typeof window !== 'undefined') window.__mm = mindMap

      // Right-click context menu (library emits node_contextmenu on node groups)
      mindMap.on('node_contextmenu', (e, node) => {
        contextNodeRef.current = node
        // Set as active node so execCommand with null appointNodes applies to this node
        if (mmRef.current?.renderer) {
          mmRef.current.renderer.activeNodeList = Array.isArray(node) ? node : [node]
        }
        setContextMenuRef.current({ x: e.clientX, y: e.clientY, node })
      })
      document.addEventListener('keydown', onKeyDown)
      containerRef.current?.addEventListener('pointerdown', markLocalInteraction, true)
      containerRef.current?.addEventListener('input', markLocalInteraction, true)
      containerRef.current?.addEventListener('paste', markLocalInteraction, true)
      document.addEventListener('keydown', markLocalInteraction, true)

      // Track active node for media upload
      mindMap.on('node_active', (node) => {
        const n = Array.isArray(node) ? node[0] : node
        activeNodeRef.current = n
      })
      mindMap.on('node_click', (node) => {
        const n = Array.isArray(node) ? node[0] : node
        activeNodeRef.current = n

        // Link mode: first click = source, second click = target
        if (linkModeRef.current) {
          if (!linkSourceRef.current) {
            linkSourceRef.current = n
          } else if (n !== linkSourceRef.current) {
            mmRef.current?.associativeLine?.addLine(linkSourceRef.current, n)
            mmRef.current?.emit('data_change')
            linkSourceRef.current = null
            linkModeRef.current = false
            setLinkMode(false)
          }
        }
      })
      // Run restoration after async layout/render completes
      const onFirstRender = () => {
        mindMap.off('node_tree_render_end', onFirstRender)

        applyingRemoteUpdateRef.current = true
        try {
          injectVideoPlaceholders(containerRef.current, pendingVideoBlobsRef.current, api)
          restoreNodeMedia(mindMap).catch(console.error)

          try { restoreAssociativeLines(mindMap, originDataRef.current) } catch (err) { console.error('Failed to restore associative lines:', err) }
          try { restoreGeneralizations(mindMap, originDataRef.current) } catch (err) { console.error('Failed to restore generalizations:', err) }
          try { restoreBoundaries(mindMap, originDataRef.current) } catch (err) { console.error('Failed to restore boundaries:', err) }
          try { restoreAllMarkers(mindMap, originDataRef.current) } catch (err) { console.error('Failed to restore markers:', err) }
          const currentData = buildDataTreeFromNodes()
          if (currentData) {
            originDataRef.current = simpleMindMapToTencent(currentData, originDataRef.current)
            const snapshot = JSON.stringify(originDataRef.current)
            lastAppliedRemoteSnapshotRef.current = snapshot
            lastAppliedRemoteComparableSnapshotRef.current = comparableTencentMindSnapshot(originDataRef.current)
            lastSavedSnapshotRef.current = snapshot
            lastSavedComparableSnapshotRef.current = lastAppliedRemoteComparableSnapshotRef.current
          }
        } finally {
          setTimeout(() => {
            ignoreDataChangeUntilRef.current = Date.now() + INITIAL_DATA_CHANGE_SUPPRESS_MS
            applyingRemoteUpdateRef.current = false
          }, 0)
        }
      }
      mindMap.on('node_tree_render_end', onFirstRender)

      // Listen for data changes to auto-save. Restoration and remote apply
      // paths toggle applyingRemoteUpdateRef so real user edits can sync
      // immediately after the editor opens.
      mindMap.on('data_change', () => {
        if (applyingRemoteUpdateRef.current) return
        if (Date.now() < ignoreDataChangeUntilRef.current) {
          const hasRecentLocalInteraction = Date.now() < localInteractionUntilRef.current
          if (!hasPendingLocalSaveRef.current && !hasRecentLocalInteraction) return
          const currentData = buildDataTreeFromNodes()
          if (!currentData) return
          const snapshot = comparableTencentMindSnapshot(simpleMindMapToTencent(currentData, originDataRef.current))
          if (snapshot === lastAppliedRemoteComparableSnapshotRef.current || snapshot === lastSavedComparableSnapshotRef.current) return
        }
        hasPendingLocalSaveRef.current = true
        broadcastCurrentData()
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => {
          if (applyingRemoteUpdateRef.current) return
          if (!hasPendingLocalSaveRef.current) return
          saveDataRef.current?.()
        }, 800)
      })

      // onConnectionChange is handled by a reactive effect below
    }

    init()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      containerRef.current?.removeEventListener('pointerdown', markLocalInteraction, true)
      containerRef.current?.removeEventListener('input', markLocalInteraction, true)
      containerRef.current?.removeEventListener('paste', markLocalInteraction, true)
      document.removeEventListener('keydown', markLocalInteraction, true)
      mounted = false
      // Do NOT clear saveTimerRef — pending saves must complete even when
      // the mind map is destroyed/recreated on remote Yjs updates.
      blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
      blobUrlsRef.current.clear()
      if (mmRef.current) {
        mmRef.current.destroy()
        mmRef.current = null
        if (typeof window !== 'undefined') window.__mm = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, loading])

  // Apply remote Yjs updates in-place without destroying/recreating the mind map.
  // The init effect above handles initial load and canvas changes only.
  useEffect(() => {
    if (!yjsTencentData || yjsLoading || !remoteUpdateVersion) return
    if (!mmRef.current || !originDataRef.current) return
    if (lastRemoteAppliedVersionRef.current >= remoteUpdateVersion) return
    try {
      const remoteSnapshot = JSON.stringify(yjsTencentData)
      const remoteComparableSnapshot = comparableTencentMindSnapshot(yjsTencentData)
      if (shouldSkipTencentRemoteApply(remoteSnapshot, {
        remoteComparableSnapshot,
        lastBroadcastSnapshot: lastBroadcastSnapshotRef.current,
        lastBroadcastComparableSnapshot: lastBroadcastComparableSnapshotRef.current,
        lastSavedSnapshot: lastSavedSnapshotRef.current,
        lastSavedComparableSnapshot: lastSavedComparableSnapshotRef.current,
        lastAppliedRemoteSnapshot: lastAppliedRemoteSnapshotRef.current,
        lastAppliedRemoteComparableSnapshot: lastAppliedRemoteComparableSnapshotRef.current
      })) {
        lastRemoteAppliedVersionRef.current = remoteUpdateVersion
        return
      }
      if (hasPendingLocalSaveRef.current) {
        return
      }
      lastRemoteAppliedVersionRef.current = remoteUpdateVersion
      remoteUpdateCountRef.current++
      originDataRef.current = yjsTencentData
      lastAppliedRemoteSnapshotRef.current = remoteSnapshot
      lastAppliedRemoteComparableSnapshotRef.current = remoteComparableSnapshot
      lastSavedSnapshotRef.current = remoteSnapshot
      lastSavedComparableSnapshotRef.current = lastAppliedRemoteComparableSnapshotRef.current
      applyingRemoteUpdateRef.current = true
      ignoreDataChangeUntilRef.current = Date.now() + REMOTE_DATA_CHANGE_SUPPRESS_MS
      clearTimeout(saveTimerRef.current)
      const smmData = tencentToSimpleMindMap(yjsTencentData)
      const appliedInPlace = applyRemoteDataInPlace(mmRef.current, smmData, yjsTencentData)
      if (!appliedInPlace) {
        mmRef.current.setData(smmData)
        mmRef.current.render(() => {
          overlaySimpleNodeDataByTencentId(mmRef.current, smmData)
          // Re-apply imperative features destroyed by setData+render
          try { restoreAssociativeLines(mmRef.current, yjsTencentData) } catch (e) { console.error('Remote restore associative lines:', e) }
          try { restoreGeneralizations(mmRef.current, yjsTencentData) } catch (e) { console.error('Remote restore generalizations:', e) }
          try { restoreBoundaries(mmRef.current, yjsTencentData) } catch (e) { console.error('Remote restore boundaries:', e) }
          try { restoreAllMarkers(mmRef.current, yjsTencentData) } catch (e) { console.error('Remote restore markers:', e) }
          restoreNodeMedia(mmRef.current).catch(e => console.error('Remote restore media:', e))
          setTimeout(() => {
            ignoreDataChangeUntilRef.current = Date.now() + REMOTE_DATA_CHANGE_SUPPRESS_MS
            applyingRemoteUpdateRef.current = false
          }, 0)
        })
      } else {
        setTimeout(() => {
          ignoreDataChangeUntilRef.current = Date.now() + REMOTE_DATA_CHANGE_SUPPRESS_MS
          applyingRemoteUpdateRef.current = false
        }, 0)
      }
    } catch (err) {
      applyingRemoteUpdateRef.current = false
      console.error('[YJS-REMOTE] Failed to apply remote update:', err)
      setLoading(true)
      setLoading(false)
    }
  }, [yjsTencentData, remoteUpdateVersion, yjsLoading])

  // Report real connection status via onConnectionChange
  useEffect(() => {
    if (loading || !canvasId) return
    let label
    if (!connected) label = 'disconnected'
    else if (!synced) label = 'syncing'
    else label = 'synced'
    onConnectionChange?.({ connected, synced, label, onlineCount }, canvasId)
  }, [connected, synced, onlineCount, loading, readonly, canvasId, onConnectionChange])

  // Update readonly mode
  useEffect(() => {
    mmRef.current?.setMode(readonly ? 'readonly' : 'edit')
  }, [readonly])

  // Broadcast local cursor position via Yjs awareness
  useEffect(() => {
    if (!roomId || !updateAwareness || !isActive) return

    const handleMouseMove = (e) => {
      const mm = mmRef.current
      if (!mm) return
      // Get viewport coordinates relative to the container
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      updateAwareness({
        userId: user?.id || 'anonymous',
        username: user?.username || '匿名用户',
        pointer: { x, y, tool: 'pointer' },
        button: e.buttons > 0 ? 'down' : 'up'
      })
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [roomId, updateAwareness, user, isActive])

  // Poll remote awareness states and render remote cursors
  useEffect(() => {
    if (!roomId || !getAwarenessStates || !isActive) return

    let lastSerialized = ''
    const cursorContainerRef = { current: null }

    const interval = setInterval(() => {
      const states = getAwarenessStates()
      const remoteCursors = []
      states.forEach((state, clientId) => {
        if (!state || !state.userId || !state.pointer) return
        if (state.userId === user?.id) return
        remoteCursors.push({
          id: clientId,
          userId: state.userId,
          username: state.username || '协作者',
          pointer: state.pointer,
          color: getUserColor(state.userId)
        })
      })

      const serialized = JSON.stringify(remoteCursors)
      if (serialized === lastSerialized) return
      lastSerialized = serialized

      // Render remote cursors as overlay elements
      const container = containerRef.current
      if (!container) return

      // Remove old cursor elements
      const oldCursors = container.querySelectorAll('.remote-cursor')
      oldCursors.forEach(el => el.remove())

      // Add new cursor elements
      for (const cursor of remoteCursors) {
        const cursorEl = document.createElement('div')
        cursorEl.className = 'remote-cursor'
        cursorEl.style.cssText = `
          position: absolute;
          left: ${cursor.pointer.x}px;
          top: ${cursor.pointer.y}px;
          pointer-events: none;
          z-index: 1000;
          transform: translate(-50%, -50%);
        `
        cursorEl.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 3L19 12L12 13L9 20L5 3Z" fill="${cursor.color}" stroke="white" stroke-width="1.5"/>
          </svg>
          <span style="
            position: absolute;
            left: 16px;
            top: 16px;
            background: ${cursor.color};
            color: white;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 12px;
            white-space: nowrap;
          ">${cursor.username}</span>
        `
        container.appendChild(cursorEl)
      }
    }, 50)

    return () => {
      clearInterval(interval)
      // Clean up cursor elements
      const container = containerRef.current
      if (container) {
        const cursors = container.querySelectorAll('.remote-cursor')
        cursors.forEach(el => el.remove())
      }
    }
  }, [roomId, getAwarenessStates, user, isActive])

  // Build a clean data tree from the mind map's node tree.
  // mmRef.current.getData() can return corrupted data (e.g. root text replaced
  // with a child's text) after INSERT_CHILD_NODE with the RichText plugin,
  // so we walk the node tree directly to build an accurate snapshot.
  function buildDataTreeFromNodes() {
    const mm = mmRef.current
    if (!mm?.renderer?.renderTree) return null

    const walk = (node) => {
      const realNode = node?._node || node
      const data = { ...(realNode?.nodeData?.data || realNode?.data || node?.data || {}) }
      const children = []
      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          children.push(walk(child))
        }
      }
      return { data, children }
    }

    return walk(mm.renderer.renderTree)
  }

  // Save data to API. skipYjs=true persists to HTTP without re-broadcasting via Yjs
  // (used when the save is triggered by a remote Yjs update that's already been applied).
  const saveData = useCallback(async ({ skipYjs = false } = {}) => {
    if (!originDataRef.current || !mmRef.current) {
      return
    }
    try {
      normalizeAssociativeLineDataForMindMap(mmRef.current)
      const currentData = buildDataTreeFromNodes()
      if (!currentData) return
      const tencentData = simpleMindMapToTencent(currentData, originDataRef.current)

      // Persist associative lines as Tencent relationships (always overwrite)
      const lineList = mmRef.current.associativeLine?.lineList || []
      const relationships = []
      for (const line of lineList) {
        const fromNode = line[3]
        const toNode = line[4]
        const fromId = fromNode?.nodeData?.data?._tencentMeta?.id
        const toId = toNode?.nodeData?.data?._tencentMeta?.id
        if (fromId && toId) {
          // Capture bezier control points, endpoints, and style from node data
          const fromUid = fromNode.getData?.('uid')
          const toUid = toNode.getData?.('uid')
          const targets = fromNode.getData?.('associativeLineTargets') || []
          const targetIndex = targets.indexOf(toUid)

          let controlPoints = {}
          let lineEndPoints = {}
          let lineStyle = { lineColor: '#319B62' }

          if (targetIndex >= 0) {
            const allOffsets = fromNode.getData?.('associativeLineTargetControlOffsets') || []
            const allPoints = fromNode.getData?.('associativeLinePoint') || []
            const offsets = allOffsets[targetIndex]
            const points = allPoints[targetIndex]

            if (Array.isArray(offsets) && offsets[0] && offsets[1] && points) {
              const sp = points.startPoint || {}
              const ep = points.endPoint || {}
              controlPoints = {
                "0": { x: (sp.x || 0) + (offsets[0]?.x || 0), y: (sp.y || 0) + (offsets[0]?.y || 0) },
                "1": { x: (ep.x || 0) + (offsets[1]?.x || 0), y: (ep.y || 0) + (offsets[1]?.y || 0) }
              }
              lineEndPoints = {
                "0": { x: sp.x || 0, y: sp.y || 0 },
                "1": { x: ep.x || 0, y: ep.y || 0 }
              }
            }

            const allStyles = fromNode.getData?.('associativeLineStyle') || {}
            const perLineStyle = allStyles[toUid]
            if (perLineStyle) {
              lineStyle = {
                lineColor: perLineStyle.associativeLineColor || '#319B62',
                ...(perLineStyle.associativeLineWidth != null ? { lineWidth: perLineStyle.associativeLineWidth } : {}),
                ...(perLineStyle.associativeLineDasharray != null ? { lineDasharray: perLineStyle.associativeLineDasharray } : {})
              }
            }
          }

          // Extract line text from node data (associativeLineText maps targetUid → text)
          const allLineText = fromNode.getData?.('associativeLineText') || {}
          const lineText = allLineText[toUid] || ''

          relationships.push({
            id: `line_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            end1Id: fromId,
            end2Id: toId,
            title: lineText,
            controlPoints,
            lineEndPoints,
            style: lineStyle
          })
        }
      }
      tencentData.relationships = relationships

      const snapshot = JSON.stringify(tencentData)
      if (snapshot === lastAppliedRemoteSnapshotRef.current || snapshot === lastSavedSnapshotRef.current) {
        return
      }

      originDataRef.current = tencentData
      await api.put(`/canvases/${canvasId}/tencentmind`, { data: tencentData })
      lastSavedSnapshotRef.current = snapshot
      lastSavedComparableSnapshotRef.current = comparableTencentMindSnapshot(tencentData)
      hasPendingLocalSaveRef.current = false
      if (!skipYjs) syncToYjs(tencentData)
    } catch (err) {
      console.error('Failed to save tencent mind data:', err)
    }
  }, [canvasId, syncToYjs])

  saveDataRef.current = saveData

  const broadcastCurrentData = useCallback(() => {
    if (!originDataRef.current || !mmRef.current) return
    normalizeAssociativeLineDataForMindMap(mmRef.current)
    const currentData = buildDataTreeFromNodes()
    if (!currentData) return
    const tencentData = simpleMindMapToTencent(currentData, originDataRef.current)
    const snapshot = JSON.stringify(tencentData)
    const comparableSnapshot = comparableTencentMindSnapshot(tencentData)
    if (snapshot === lastBroadcastSnapshotRef.current || snapshot === lastAppliedRemoteSnapshotRef.current) return
    originDataRef.current = tencentData
    lastBroadcastSnapshotRef.current = snapshot
    lastBroadcastComparableSnapshotRef.current = comparableSnapshot
    syncToYjs(tencentData)
  }, [syncToYjs])

  const handleLayoutChange = useCallback((layout) => {
    setCurrentLayout(layout)
    mmRef.current?.setLayout(layout)
  }, [])

  const handleThemeChange = useCallback((theme) => {
    setCurrentTheme(theme)
    mmRef.current?.setTheme(theme)
  }, [])

  const handleAddMedia = useCallback(() => {
    const activeNodes = mmRef.current?.renderer?.activeNodeList
    const raw = activeNodes?.[0]
    if (!raw || readonly) return

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*,video/*,.gif'

    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      if (file.size > 10 * 1024 * 1024) {
        alert('文件大小不能超过 10MB')
        return
      }

      const formData = new FormData()
      formData.append('file', file)
      try {
        const res = await api.post(`/upload?board_id=${boardId}`, formData)
        const uploadId = res.data.id

        const blobRes = await api.get(`/upload/${uploadId}`, { responseType: 'blob' })
        const blobUrl = URL.createObjectURL(blobRes.data)
        blobUrlsRef.current.add(blobUrl)

        // Set media data on the node's nodeData.data object
        if (file.type.startsWith('video/')) {
          // Placeholder image reserves layout space; injectVideoPlaceholders swaps it for live <video>
          const imageSize = { width: 120, height: 80, custom: true }
          pendingVideoBlobsRef.current.set(uploadId, blobUrl)
          mmRef.current?.execCommand('SET_NODE_IMAGE', raw, {
            url: VIDEO_PLACEHOLDER,
            width: imageSize.width,
            height: imageSize.height,
            custom: imageSize.custom
          })
          applyNodeDataPatch(raw, {
            _uploadId: uploadId,
            _mediaType: 'video',
            _blobUrl: blobUrl,
            _imageSize: imageSize
          })
        } else {
          const img = new Image()
          img.src = blobUrl
          await img.decode()
          const maxW = 200, maxH = 150
          let w = img.naturalWidth, h = img.naturalHeight
          if (w > maxW || h > maxH) {
            const ratio = Math.min(maxW / w, maxH / h)
            w = Math.round(w * ratio)
            h = Math.round(h * ratio)
          }
          const imageSize = { width: w, height: h, custom: true }
          mmRef.current?.execCommand('SET_NODE_IMAGE', raw, {
            url: blobUrl,
            width: imageSize.width,
            height: imageSize.height,
            custom: imageSize.custom
          })
          applyNodeDataPatch(raw, {
            _uploadId: uploadId,
            _mediaType: 'image',
            _imageSize: imageSize
          })
        }
        mmRef.current?.render(() => {
          injectVideoPlaceholders(containerRef.current, pendingVideoBlobsRef.current, api)
          broadcastCurrentData()
        })
        mmRef.current?.emit('data_change')
      } catch (err) {
        console.error('Upload failed:', err)
      }
    }

    input.click()
  }, [readonly, boardId])

  const handleRemoveGeneralization = useCallback(() => {
    const mm = mmRef.current
    if (!mm) return

    // Find any node that has generalization data
    const findGen = (n) => {
      if (!n) return null
      const gen = n.getData?.('generalization') ?? n.data?.generalization ?? n.nodeData?.data?.generalization
      if (gen != null) return n
      for (const c of n.children || []) {
        const found = findGen(c)
        if (found) return found
      }
      return null
    }

    const node = findGen(mm.renderer?.renderTree)
    if (node) {
      // Direct property removal (most reliable)
      if (node.nodeData?.data) {
        node.nodeData.data.generalization = null
      }
      if (node.data) {
        node.data.generalization = null
      }
      // Also try library command
      try { mm.execCommand('SET_NODE_DATA', node, { generalization: null }) } catch (e) {}
      mm.render()
      mm.emit('data_change')

      // Manually clean up any generalization child nodes
      if (node.children) {
        node.children = node.children.filter(c => !c.isGeneralization)
      }
      mm.render()
      return
    }

    mm.execCommand('REMOVE_GENERALIZATION')
    mm.emit('data_change')
  }, [])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-400">
        加载中...
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b shrink-0 flex-wrap">
        <span className="text-xs text-gray-400 font-mono mr-2">腾讯思维</span>

        <select
          className="text-xs border rounded px-2 py-1"
          value={currentLayout}
          onChange={e => handleLayoutChange(e.target.value)}
        >
          {LAYOUTS.map(l => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>

        <select
          className="text-xs border rounded px-2 py-1"
          value={currentTheme}
          onChange={e => handleThemeChange(e.target.value)}
        >
          {THEMES.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <div className="w-px h-4 bg-gray-300 mx-1" />

        <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={readonly}
            onChange={e => setReadonly(e.target.checked)}
          />
          只读
        </label>

        <div className="flex-1" />
      </div>

      {/* Context menu overlay */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-50"
          onContextMenu={e => e.preventDefault()}
          onClick={(e) => { if (e.target === e.currentTarget) setContextMenu(null) }}
        >
          <div
            ref={menuEl => {
              if (!menuEl) return
              const rect = menuEl.getBoundingClientRect()
              if (rect.right > window.innerWidth) menuEl.style.left = (window.innerWidth - rect.width - 8) + 'px'
              if (rect.bottom > window.innerHeight) menuEl.style.top = (window.innerHeight - rect.height - 8) + 'px'
            }}
            className="absolute bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[160px] text-sm"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={e => e.stopPropagation()}
          >
            <ContextMenuItem onClick={() => { mmRef.current?.execCommand('INSERT_CHILD_NODE'); setContextMenu(null) }}>
              添加子节点
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => { mmRef.current?.execCommand('INSERT_NODE'); setContextMenu(null) }}
              disabled={contextMenu.node.isRoot}
            >
              添加同级
            </ContextMenuItem>

            <ContextMenuDivider />

            <ContextMenuItem onClick={() => { setContextMenu(null); handleAddMedia() }}>
              添加图片/视频
            </ContextMenuItem>

            <ContextMenuDivider />

            <ContextMenuItem
              onClick={() => { mmRef.current?.execCommand('ADD_GENERALIZATION'); mmRef.current?.emit('data_change'); setContextMenu(null) }}
              disabled={contextMenu.node.isRoot}
            >
              添加概要
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => { setContextMenu(null); handleRemoveGeneralization() }}
              disabled={contextMenu.node.isRoot}
            >
              删除概要
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                const mm = mmRef.current
                if (!mm) return
                mm.execCommand('ADD_OUTER_FRAME', null, { strokeColor: '#0984e3', fill: 'rgba(9,132,227,0.05)' })
                mm.emit('data_change')
                setContextMenu(null)
              }}
              disabled={contextMenu.node.isRoot}
            >
              添加外框
            </ContextMenuItem>
            <ContextMenuItem onClick={() => { mmRef.current?.outerFrame?.removeActiveOuterFrame(); mmRef.current?.emit('data_change'); setContextMenu(null) }}>
              删除外框
            </ContextMenuItem>

            <ContextMenuDivider />

            <ContextMenuItem onClick={() => { setLinkMode(true); linkModeRef.current = true; setContextMenu(null) }}>
              创建关联线
            </ContextMenuItem>
            <ContextMenuItem onClick={() => { mmRef.current?.associativeLine?.removeLine(); mmRef.current?.emit('data_change'); setContextMenu(null) }}>
              删除关联线
            </ContextMenuItem>

            <ContextMenuDivider />

            <div className="relative">
              <button
                className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center justify-between"
                onMouseEnter={() => markerMenuRef.current?.classList.remove('hidden')}
                onMouseLeave={(e) => {
                  setTimeout(() => {
                    if (markerMenuRef.current && !markerMenuRef.current.matches(':hover')) {
                      markerMenuRef.current.classList.add('hidden')
                    }
                  }, 200)
                }}
                onClick={(e) => {
                  const menu = markerMenuRef.current
                  if (menu) menu.classList.toggle('hidden')
                }}
              >
                <span>标记</span>
                <span className="text-gray-400">▸</span>
              </button>
              <div
                ref={markerMenuRef}
                className="hidden absolute left-full top-0 ml-1 bg-white rounded-lg shadow-xl border border-gray-200 p-2"
                onMouseEnter={() => markerMenuRef.current?.classList.remove('hidden')}
                onMouseLeave={() => markerMenuRef.current?.classList.add('hidden')}
              >
                <div className="grid grid-cols-5 gap-1 w-[140px]">
                  {[
                    { key: 'tencent_question', label: '疑问', svg: questionIcon },
                    { key: 'tencent_priority', label: '优先级', svg: priorityIcon },
                    { key: 'tencent_progress', label: '进度', svg: progressIcon },
                    { key: 'tencent_star', label: '星标', svg: starIcon },
                    { key: 'tencent_check', label: '完成', svg: checkIcon },
                    { key: 'tencent_cross', label: '错误', svg: crossIcon },
                    { key: 'tencent_idea', label: '灵感', svg: ideaIcon },
                    { key: 'tencent_warning', label: '警告', svg: warningIcon },
                    { key: 'tencent_target', label: '目标', svg: targetIcon },
                    { key: 'tencent_clock', label: '时钟', svg: clockIcon },
                  ].map(({ key, label, svg }) => {
                    const node = contextNodeRef.current
                    const active = node ? (node.getData?.('icon') || node.data?.icon || []).includes(key) : false
                    return (
                      <button
                        key={key}
                        title={label}
                        className={`w-7 h-7 flex items-center justify-center rounded ${
                          active ? 'bg-blue-100 ring-2 ring-blue-400' : 'hover:bg-gray-100'
                        }`}
                        onClick={() => {
                          const mm = mmRef.current
                          const node = contextNodeRef.current
                          if (!mm || !node) return
                          const icons = node.getData?.('icon') || []
                          if (icons.includes(key)) {
                            node.setIcon(icons.filter(k => k !== key))
                          } else {
                            node.setIcon([...icons, key])
                          }
                          mm.emit('data_change')
                          setContextMenu(null)
                        }}
                        dangerouslySetInnerHTML={{ __html: svg }}
                      />
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mind map container */}
      <div ref={containerRef} className="flex-1 overflow-hidden" />
    </div>
  )
})

const ContextMenuItem = ({ onClick, disabled, children }) => (
  <button
    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 ${
      disabled
        ? 'text-gray-300 cursor-not-allowed'
        : 'text-gray-700 hover:bg-gray-100'
    }`}
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
  >
    {children}
  </button>
)

const ContextMenuDivider = () => (
  <div className="h-px bg-gray-200 my-1" />
)

export default TencentMindEditor
