import { iconKeyToMarkerId, markerIdToIconKey } from './marker-icons'

/**
 * Tencent Docs style mind map data format conversion utilities.
 * Converts between Tencent Docs rootTopic format and simple-mind-map format.
 */

/**
 * Extract plain text from a Tencent Docs title object.
 * Title format: { children: [{ type: 'paragraph', children: [{ type: 'text', text: '...' }] }] }
 */
function extractText(title) {
  if (typeof title === 'string') return title
  if (!title?.children) return ''
  for (const para of title.children) {
    if (para.children) {
      const texts = para.children.map(c => c.text || '').join('')
      if (texts) return texts
    }
  }
  return ''
}

/**
 * Extract rich text segments from a Tencent Docs title object.
 * Returns array of {text, color} pairs if multiple distinct colors exist, else null.
 */
function extractRichText(title) {
  if (!title?.children) return null
  const segments = []
  for (const para of title.children) {
    if (para.children) {
      for (const c of para.children) {
        segments.push({ text: cleanRichTextArtifact(c.text || ''), color: c.color || '#1f1f1f' })
      }
    }
  }
  if (segments.length <= 1) return null
  // Check if there are actually multiple distinct colors
  const uniqueColors = new Set(segments.map(s => s.color))
  if (uniqueColors.size <= 1) return null
  return segments
}

/**
 * Decode nested HTML entities and strip HTML tags from text corrupted by
 * RichText plugin save/load cycles (for example, encoded paragraph tags).
 */
function cleanRichTextArtifact(text) {
  if (!text || !text.includes('&')) return text
  // Decode nested entities iteratively
  let result = text
  let prev
  do {
    prev = result
    result = result.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  } while (result !== prev)
  // Strip HTML tags left after decoding
  return result.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim()
}

function plainSimpleText(text) {
  return cleanRichTextArtifact(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .trim()
}

/**
 * Recursively convert Tencent rootTopic node to simple-mind-map node.
 */
function convertNode(tencentNode) {
  const rawText = extractText(tencentNode.title)
  const text = cleanRichTextArtifact(rawText)
  const node = {
    data: { text }
  }

  // Preserve collapse state (simple-mind-map uses expand: true = open)
  if (tencentNode.collapse === true) {
    node.data.expand = false
  }

  // Preserve bold style
  if (tencentNode.style?.fontWeight === 'bold') {
    node.data.bold = true
  }

  if (tencentNode.markers?.length) {
    const iconKeys = tencentNode.markers
      .map(marker => markerIdToIconKey(marker.markerId))
      .filter(Boolean)
    if (iconKeys.length > 0) node.data.icon = iconKeys
  }

  const generalization = tencentNode.extensions?.['drawwork.generalization']
  if (generalization?.length) {
    node.data.generalization = generalization
  }

  // Preserve Tencent-specific metadata for round-trip fidelity
  const meta = {}
  if (tencentNode.id) meta.id = tencentNode.id
  if (tencentNode.markers?.length) meta.markers = tencentNode.markers
  if (tencentNode.boundaries) meta.boundaries = tencentNode.boundaries
  if (tencentNode.style?.color) meta.color = tencentNode.style.color
  if (tencentNode.position) meta.position = tencentNode.position
  if (tencentNode.extensions) meta.extensions = tencentNode.extensions

  // Handle rich text: if title has multiple colored segments, store for round-trip
  const richSegments = extractRichText(tencentNode.title)
  if (richSegments) {
    meta.richText = richSegments
    node.data.richText = true
    // Convert to HTML for simple-mind-map RichText plugin
    node.data.text = richSegments.map(s => {
      const escaped = (s.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      if (s.color && s.color !== '#1f1f1f') {
        return `<span style="color:${s.color}">${escaped}</span>`
      }
      return escaped
    }).join('')
  }

  if (Object.keys(meta).length) {
    node.data._tencentMeta = meta
  }

  // Read media extensions for image/video uploads
  const media = tencentNode.extensions?.['drawwork.media']
  if (media) {
    node.data._uploadId = media.uploadId
    node.data._mediaType = media.mediaType || 'image'
    if (media.imageSize) node.data._imageSize = media.imageSize
  }

  // Convert children
  const attached = tencentNode.children?.attached
  if (attached && attached.length > 0) {
    node.children = attached.map(child => convertNode(child))
    applyBoundariesToChildren(node, tencentNode.boundaries)
  }

  return node
}

function applyBoundariesToChildren(node, boundaries) {
  if (!node.children || !boundaries?.length) return
  boundaries.forEach((boundary, index) => {
    const [start, end] = boundary.range || [0, 0]
    const { range, ...style } = boundary
    const outerFrame = {
      groupId: boundary.id || `boundary_${index}`,
      ...style
    }
    for (let i = start; i <= end && i < node.children.length; i++) {
      if (i >= 0) node.children[i].data.outerFrame = outerFrame
    }
  })
}

/**
 * Convert Tencent Docs mind map data to simple-mind-map format.
 */
/**
 * Read the root right-number config and apply child direction before first render.
 */
function applyUnbalancedDir(rootNode, rightNumber) {
  if (rightNumber == null || !rootNode.children) return
  const center = Math.min(rightNumber, rootNode.children.length)
  rootNode.children.forEach((child, index) => {
    child.data.dir = (index + 1 <= center) ? 'right' : 'left'
  })
}

export function tencentToSimpleMindMap(tencentData) {
  if (!tencentData?.rootTopic) {
    return { data: { text: '中心主题' } }
  }

  const result = convertNode(tencentData.rootTopic)

  // Apply dir before first render so the unbalanced layout is stable.
  const rightNumber = tencentData.rootTopic?.extensions?.['structureClass.unbalanced']?.['right-number']
  applyUnbalancedDir(result, rightNumber)

  // Store rightNumber on root data for plugins that read it directly.
  if (rightNumber != null) {
    result.data.rightNumber = rightNumber
  }

  return result
}

/**
 * Convert the title text back to Tencent Docs rich text format.
 */
function makeTitle(text, color) {
  return {
    children: [{
      type: 'paragraph',
      children: [{
        type: 'text',
        text: text || '',
        ...(color ? { color } : {})
      }]
    }],
    type: 'document',
    paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0,
    anchor: 1, whiteSpaceType: 0, anchorCenter: false,
    docSizeType: -2, columnNumber: 1, columnSpace: 0,
    handingChar4OneLine: false, handingMaxSpace: -1,
    tailWhitespaceCalculation: 'exclude'
  }
}

/**
 * Build a Tencent Docs rich text title from multiple text segments with colors.
 */
function makeRichTitle(segments) {
  return {
    children: [{
      type: 'paragraph',
      children: segments.map(s => ({
        type: 'text',
        text: s.text || '',
        ...(s.color && s.color !== '#1f1f1f' ? { color: s.color } : {})
      }))
    }],
    type: 'document',
    paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0,
    anchor: 1, whiteSpaceType: 0, anchorCenter: false,
    docSizeType: -2, columnNumber: 1, columnSpace: 0,
    handingChar4OneLine: false, handingMaxSpace: -1,
    tailWhitespaceCalculation: 'exclude'
  }
}

/**
 * Rebuild a Tencent Docs node from saved metadata + current text.
 */
function rebuildNode(text, meta, children) {
  const plainText = plainSimpleText(text)
  const richTextPlain = meta?.richText?.map(s => s.text || '').join('')
  const useStoredRichText = meta?.richText && plainText === richTextPlain
  const node = {
    id: meta?.id || `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: useStoredRichText ? makeRichTitle(meta.richText) : makeTitle(plainText, meta?.color),
    children: { attached: children || [], detached: [] }
  }
  if (meta?.markers) node.markers = meta.markers
  if (meta?.boundaries) node.boundaries = meta.boundaries
  if (meta?.position) node.position = meta.position
  if (meta?.extensions) node.extensions = meta.extensions
  if (meta?.id !== 'root' && meta?.color) {
    node.style = { color: meta.color }
  }
  return node
}

function cloneTencentMeta(meta) {
  if (!meta) return {}
  return {
    ...meta,
    markers: meta.markers ? [...meta.markers] : undefined,
    boundaries: meta.boundaries ? [...meta.boundaries] : undefined,
    extensions: meta.extensions ? { ...meta.extensions } : undefined
  }
}

/**
 * Recursively convert simple-mind-map node back to Tencent format.
 */
function convertBack(smmNode, origMeta) {
  let text = smmNode.data?.text || ''
  const meta = cloneTencentMeta(smmNode.data?._tencentMeta || origMeta)
  const existingMarkers = meta.markers ? [...meta.markers] : []
  delete meta.markers
  if (meta.extensions) {
    delete meta.extensions['drawwork.generalization']
    delete meta.extensions['drawwork.media']
    if (Object.keys(meta.extensions).length === 0) delete meta.extensions
  }

  // Strip HTML tags added by RichText plugin for non-rich-text nodes.
  // The plugin wraps ALL text in <p> tags during editing (even without richText: true),
  // so non-rich-text nodes end up with text like "<p>Topic</p>" instead of "Topic".
  if (!meta?.richText && text.includes('<')) {
    text = text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
  }

  // Detect and skip generalization children when converting back
  const generalization = smmNode.data?.generalization
  let children = []
  if (smmNode.children) {
    const boundaryMap = {}

    smmNode.children.forEach((c, i) => {
      // Collect outerFrame data for boundary reconstruction
      // (boundaries are stored as outerFrame on each child within a group)
      const outerFrame = c.data?.outerFrame
      if (outerFrame?.groupId) {
        if (!boundaryMap[outerFrame.groupId]) {
          const { groupId, ...style } = outerFrame
          boundaryMap[outerFrame.groupId] = { range: [i, i], ...style }
        } else {
          boundaryMap[outerFrame.groupId].range[1] = i
        }
      }

      const childData = c.data || {}
      const isGeneralizationChild = Boolean(
        childData.isGeneralization ||
        childData.generalizationNode ||
        childData._generalization ||
        childData._tencentMeta?.isGeneralization
      )

      if (!isGeneralizationChild) {
        const childMeta = c.data?._tencentMeta || (origMeta?.children?.[i])
        children.push(convertBack(c, childMeta))
      }
    })

    // Reconstruct boundaries from current outerFrame data, not stale _tencentMeta
    const reconstructed = Object.values(boundaryMap)
    if (reconstructed.length > 0) {
      meta.boundaries = reconstructed
    } else {
      delete meta.boundaries
    }
  }

  const node = rebuildNode(text, meta, children)

  // Store generalization data in extensions for round-trip persistence
  if (generalization && generalization.length > 0) {
    node.extensions = node.extensions || {}
    node.extensions['drawwork.generalization'] = generalization
  }

  // Convert simple-mind-map icon data back to Tencent markers (all 10 types)
  const iconData = smmNode.data?.icon
  if (iconData && iconData.length > 0) {
    const markers = iconData.map(iconKey => {
      const markerId = iconKeyToMarkerId(iconKey)
      if (!markerId) return null
      const existingMarker = existingMarkers.find(marker => marker.markerId === markerId)
      return existingMarker || {
        markerId,
        id: `marker_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        color: '#e74c3c'
      }
    }).filter(Boolean)
    if (markers.length > 0) {
      node.markers = markers
    }
  }

  // Inject current media data into extensions for save round-trip
  const uploadId = smmNode.data?._uploadId
  if (uploadId) {
    const mediaType = smmNode.data?._mediaType || 'image'
    const imageSize = smmNode.data?._imageSize
    node.extensions = node.extensions || {}
    node.extensions['drawwork.media'] = { uploadId, mediaType, ...(imageSize ? { imageSize } : {}) }
  }

  return node
}

/**
 * Convert simple-mind-map data back to Tencent Docs rootTopic format.
 */
export function simpleMindMapToTencent(smmData, origTencentData) {
  if (!smmData) return origTencentData || { rootTopic: { id: 'root', title: makeTitle(''), children: { attached: [], detached: [] } } }

  const rootMeta = cloneTencentMeta(smmData.data?._tencentMeta || origTencentData?.rootTopic || { id: 'root' })
  delete rootMeta.markers
  if (rootMeta.extensions) {
    delete rootMeta.extensions['drawwork.generalization']
    delete rootMeta.extensions['drawwork.media']
    if (Object.keys(rootMeta.extensions).length === 0) delete rootMeta.extensions
  }
  const children = smmData.children
    ? smmData.children.map(c => convertBack(c, null))
    : []

  // Reconstruct boundaries at root level from children's outerFrame data
  if (smmData.children) {
    const rootBoundaryMap = {}
    smmData.children.forEach((c, i) => {
      const outerFrame = c.data?.outerFrame
      if (outerFrame?.groupId) {
        if (!rootBoundaryMap[outerFrame.groupId]) {
          const { groupId, ...style } = outerFrame
          rootBoundaryMap[outerFrame.groupId] = { range: [i, i], ...style }
        } else {
          rootBoundaryMap[outerFrame.groupId].range[1] = i
        }
      }
    })
    const rootBoundaries = Object.values(rootBoundaryMap)
    if (rootBoundaries.length > 0) {
      rootMeta.boundaries = rootBoundaries
    } else {
      delete rootMeta.boundaries
    }
  }

  const rootTopic = rebuildNode(smmData.data?.text || '', rootMeta, children)

  // Inject root media data
  const rootUploadId = smmData.data?._uploadId
  if (rootUploadId) {
    const mediaType = smmData.data?._mediaType || 'image'
    const imageSize = smmData.data?._imageSize
    rootTopic.extensions = rootTopic.extensions || {}
    rootTopic.extensions['drawwork.media'] = { uploadId: rootUploadId, mediaType, ...(imageSize ? { imageSize } : {}) }
  }

  // Preserve root-level generalization data (smmData is the root, not processed by convertBack)
  const rootGen = smmData.data?.generalization
  if (rootGen && rootGen.length > 0) {
    rootTopic.extensions = rootTopic.extensions || {}
    rootTopic.extensions['drawwork.generalization'] = rootGen
  }

  // Preserve top-level structures
  return {
    rootTopic,
    relationships: origTencentData?.relationships || [],
    theme: origTencentData?.theme || { topic: 'default' },
    style: origTencentData?.style,
    extensions: origTencentData?.extensions,
    structureClass: origTencentData?.structureClass
  }
}

/**
 * Minimal default TencentMind data for new canvases.
 */
export const DEFAULT_TENCENT_MIND = {
  rootTopic: {
    id: 'root',
    title: makeTitle('中心主题', '#1f1f1f'),
    collapse: false,
    children: {
      detached: [],
      attached: [
        {
          id: 'default-child',
          title: makeTitle('子节点', '#1f1f1f'),
          freshTitle: true,
          children: {
            detached: [],
            attached: []
          }
        }
      ]
    },
    extensions: {
      'structureClass.unbalanced': {
        'right-number': 1
      }
    },
    structureClass: 'unbalanced'
  },
  style: {
    color: '#1f1f1f'
  },
  extensions: {
    'structureClass.unbalanced': {
      'right-number': 1
    }
  },
  structureClass: 'unbalanced',
  relationships: [],
  theme: {
    topic: 'default'
  }
}
