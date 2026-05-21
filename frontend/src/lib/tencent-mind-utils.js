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
 * RichText plugin save/load cycles (e.g. "&amp;lt;p&amp;gt;..." → "...").
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
 * 从根节点读取 right-number 配置，在转换时直接设置 dir，
 * 这样 simple-mind-map 的 mindMap 布局在首次渲染时就使用正确的方向。
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

  // 提前设置 dir，让首次渲染就不均分
  const rightNumber = tencentData.rootTopic?.extensions?.['structureClass.unbalanced']?.['right-number']
  applyUnbalancedDir(result, rightNumber)

  // 把 rightNumber 直接存在根节点上，插件可以直接读取
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
  const node = {
    id: meta?.id || `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: meta?.richText ? makeRichTitle(meta.richText) : makeTitle(text, meta?.color),
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
  delete meta.markers
  if (meta.extensions) {
    delete meta.extensions['drawwork.generalization']
    delete meta.extensions['drawwork.media']
    if (Object.keys(meta.extensions).length === 0) delete meta.extensions
  }

  // Strip HTML tags added by RichText plugin for non-rich-text nodes.
  // The plugin wraps ALL text in <p> tags during editing (even without richText: true),
  // so non-rich-text nodes end up with text like "<p>RPG</p>" instead of "RPG".
  if (!meta?.richText && text.includes('<')) {
    text = text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
  }

  // Detect and skip generalization children when converting back
  const generalization = smmNode.data?.generalization
  let children = []
  if (smmNode.children) {
    const numGen = generalization ? generalization.length : 0
    const regularCount = smmNode.children.length - numGen
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

      if (i < regularCount) {
        const childMeta = c.data?._tencentMeta || (origMeta?.children?.[i])
        children.push(convertBack(c, childMeta))
      }
      // generalization children (i >= regularCount) are skipped
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
      return markerId ? {
        markerId,
        id: `marker_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        color: '#e74c3c'
      } : null
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
 * Default EE2 mind map data for new canvases.
 * This is the actual content extracted from the Tencent Docs mind map.
 */
export const DEFAULT_TENCENT_MIND = {
  "rootTopic": {
    "id": "root",
    "title": {
      "children": [
        {
          "type": "paragraph",
          "children": [
            {
              "type": "text",
              "text": "EE2",
              "color": "#1f1f1f"
            }
          ]
        }
      ],
      "type": "document",
      "paddingLeft": 0,
      "paddingRight": 0,
      "paddingTop": 0,
      "paddingBottom": 0,
      "anchor": 1,
      "whiteSpaceType": 0,
      "anchorCenter": false,
      "docSizeType": -2,
      "columnNumber": 1,
      "columnSpace": 0,
      "handingChar4OneLine": false,
      "handingMaxSpace": -1,
      "tailWhitespaceCalculation": "exclude"
    },
    "collapse": false,
    "children": {
      "detached": [],
      "attached": [
        {
          "id": "vmOVF06NcDy-CyIWr5IWT",
          "title": "战斗方式",
          "children": {
            "attached": [
              {
                "id": "aPfUsVvjiOTxiAc_iAPN2",
                "title": "女主",
                "children": {
                  "attached": [
                    {
                      "id": "703UaaFrJMeg_AieL8g4s",
                      "title": "多武器",
                      "children": {
                        "attached": [
                          {
                            "id": "TR_1LJFRQLGWnC7edkxIP",
                            "title": "装备2把武器，战斗内可切换",
                            "children": {
                              "attached": [
                                {
                                  "id": "PgEWVULVewTpwc87RDltk",
                                  "title": "切换有消耗",
                                  "children": {
                                    "attached": []
                                  }
                                }
                              ]
                            }
                          },
                          {
                            "id": "AOkV_KIb3pl2QZ8koalhe",
                            "title": "不可空手，至少装备1把武器"
                          },
                          {
                            "id": "Ucy3teFmflTKmE96CNLsb",
                            "title": "武器有特殊技",
                            "children": {
                              "attached": [
                                {
                                  "id": "ONx8Fd9pnJi2q6vMLS8ve",
                                  "title": "装备2把武器可构成新的组合技",
                                  "boundaries": [],
                                  "children": {
                                    "attached": []
                                  }
                                }
                              ]
                            }
                          }
                        ]
                      }
                    },
                    {
                      "id": "wl8gf7LhbrZqW3k-bRXLB",
                      "title": "羁绊技",
                      "children": {
                        "attached": [
                          {
                            "id": "7fgsNW6rX15pYjEOSuEi5",
                            "title": "可装备2个"
                          },
                          {
                            "id": "2tYA6ZzE9ib5SY6OO_3Tl",
                            "title": "效果：恢复、控制、增幅"
                          }
                        ]
                      }
                    }
                  ]
                }
              },
              {
                "id": "LRH2wCA0QLIlzONdDQHuS",
                "title": "男主",
                "children": {
                  "attached": [
                    {
                      "id": "h33RaQlqKiNDi6-DxygsR",
                      "title": "单武器"
                    },
                    {
                      "id": "-xriyNrM1XKl96aqXYLBH",
                      "title": "魔法",
                      "children": {
                        "attached": [
                          {
                            "id": "7oEQbRzm-Hv3J9yxFv2sq",
                            "title": "替代多武器和羁绊能力"
                          },
                          {
                            "id": "1vVQPwseRVpr-Y9K4YEa4",
                            "title": "可使用3种魔法附着",
                            "children": {
                              "attached": [
                                {
                                  "id": "Vn7TYF-673WJ5Vvd3hkKF",
                                  "title": "影响招式效果和表现，战斗内可切换",
                                  "children": {
                                    "attached": [
                                      {
                                        "id": "5oq13Hov4OfLLlShYpIZE",
                                        "title": "切换有消耗",
                                        "boundaries": []
                                      }
                                    ]
                                  }
                                },
                                {
                                  "id": "hGHMMtp-Ku3ei9T0B8_CD",
                                  "title": "附中期间命中敌人可累积元素",
                                  "boundaries": [],
                                  "children": {
                                    "attached": [
                                      {
                                        "id": "j-UnEuh1xURbugPCrcLC8",
                                        "title": "消耗累积元素释放魔法"
                                      },
                                      {
                                        "id": "NjECsMqUERfAARxf9EVLz",
                                        "title": "2个不同的释放键，对应伤害/控制这两类魔法效果",
                                        "boundaries": []
                                      }
                                    ]
                                  }
                                }
                              ]
                            }
                          }
                        ]
                      }
                    }
                  ]
                },
                "collapse": true,
                "markers": [
                  {
                    "markerId": "symbol-question",
                    "id": "Lk9AIlE8D6xijcWeZRMam",
                    "color": "#f88825"
                  }
                ]
              }
            ]
          },
          "position": {
            "x": 91.068359375,
            "y": 50.76250000000006
          }
        },
        {
          "id": "2dtCPUEA9GXpm2L7CZvTk",
          "title": "关卡箱庭",
          "children": {
            "attached": [
              {
                "id": "YL-E1M2CLg9Myb8GvUknX",
                "title": "线性流程",
                "children": {
                  "attached": [
                    {
                      "id": "toHgWQ344GLiNugRBfxKb",
                      "title": "“珍珠项链”式，把战斗、剧情、演出玩法串起来"
                    },
                    {
                      "id": "6nYE9f43sIVfH2rvUoC1y",
                      "title": "限制",
                      "children": {
                        "attached": [
                          {
                            "id": "0TJbGvB5sYddlzo1kOEKe",
                            "title": "战斗区域锁定"
                          },
                          {
                            "id": "gVEPPQJ1gF_PevtJ85MUt",
                            "title": "箱庭之间不能走回头路"
                          }
                        ]
                      }
                    }
                  ]
                }
              },
              {
                "id": "UueGkgx3IwJ0I2qgLv8y5",
                "title": "进度推进",
                "children": {
                  "attached": [
                    {
                      "id": "hxSN3NBdSWjxI8PikM_L0",
                      "title": "使用章节、列表、节点式包装",
                      "children": {
                        "attached": []
                      }
                    },
                    {
                      "id": "5O6QlgMOlNRqQHW8_yUuJ",
                      "title": "不用地图的方式呈现",
                      "children": {
                        "attached": [
                          {
                            "id": "7b5KrF2yQMTpzYy_sqt6H",
                            "title": "线性地图，无需世界地图"
                          },
                          {
                            "id": "6IUW0cumTMSx1fYKZyAx_",
                            "title": "箱庭内也不应复杂到需要地图"
                          }
                        ]
                      }
                    },
                    {
                      "id": "SvRTzQ6bvtrPwq6_O6Swy",
                      "title": "允许玩家回顾之前章节（待定）"
                    }
                  ]
                }
              },
              {
                "id": "WuzVcaaD53IN66m2LpKA8",
                "title": "关卡内容",
                "boundaries": [],
                "children": {
                  "attached": [
                    {
                      "id": "AyQfjDNtz9xpsY6iGgYjh",
                      "title": "战斗区域"
                    },
                    {
                      "id": "WGCMYVUZ9Ll8b3RxdtacF",
                      "title": "可拾取物"
                    },
                    {
                      "id": "14E0P53sEg3fIXJhHIFHz",
                      "title": "可交互场景物件"
                    }
                  ]
                }
              }
            ]
          },
          "position": {
            "x": 0,
            "y": 92.4
          },
          "imageAlign": "up",
          "images": []
        },
        {
          "id": "bGuTjinwCgKGrLEF7W2hi",
          "title": "子主题2",
          "freshTitle": true,
          "children": {
            "attached": [
              {
                "id": "tqdYq13c5X1JxATfP3UqW",
                "title": "分支主题10",
                "freshTitle": true,
                "children": {
                  "attached": [
                    {
                      "id": "8_3MvWDmeCRugdj8aBE9j",
                      "title": "子主题1",
                      "freshTitle": true,
                      "children": {
                        "attached": [
                          {
                            "id": "2zKgqWFoi_-hvQCmuw7ye",
                            "title": "子主题1",
                            "freshTitle": true
                          },
                          {
                            "id": "2GEnTZ6AqKJqyqUM0EPrR",
                            "title": "子主题2",
                            "freshTitle": true
                          },
                          {
                            "id": "p2-CEnSmOYnuWsnRPyKML",
                            "title": "子主题3",
                            "freshTitle": true
                          }
                        ]
                      }
                    }
                  ]
                }
              }
            ]
          }
        },
        {
          "id": "ulim662qpBZWHpY_wJpnZ",
          "title": "子主题3",
          "freshTitle": true,
          "children": {
            "attached": [
              {
                "id": "DfxSSxnzFxTtjiydb_rJJ",
                "title": "分支主题6",
                "freshTitle": true,
                "children": {
                  "attached": [
                    {
                      "id": "QbH9QccGJ9pADeCOBYTz9",
                      "title": "子主题1",
                      "freshTitle": true,
                      "children": {
                        "attached": []
                      }
                    },
                    {
                      "id": "0die3098orQlGh6qUrUfu",
                      "title": "子主题5",
                      "freshTitle": true,
                      "children": {
                        "attached": []
                      }
                    },
                    {
                      "id": "5SwEQz0vRWvV6xVP9HI0Y",
                      "title": "子主题2",
                      "freshTitle": true,
                      "children": {
                        "attached": []
                      }
                    }
                  ]
                }
              },
              {
                "id": "7JGvRlOEjY0UDNIaFCCve",
                "title": "子主题4",
                "freshTitle": true,
                "children": {
                  "attached": []
                }
              },
              {
                "id": "XRees2Ow-WFZyMkMfPKvP",
                "title": "子主题2",
                "freshTitle": true,
                "children": {
                  "attached": [
                    {
                      "id": "o1yxj87u0zknEEnYaihcv",
                      "title": "子主题1",
                      "freshTitle": true,
                      "children": {
                        "attached": [
                          {
                            "id": "3ymji8imYtxCFmmgfWO_N",
                            "title": "子主题1",
                            "freshTitle": true,
                            "children": {
                              "attached": []
                            }
                          }
                        ]
                      }
                    },
                    {
                      "id": "rVtg2Dcj39LBEoyVkCNfh",
                      "title": "子主题2",
                      "freshTitle": true,
                      "children": {
                        "attached": []
                      }
                    }
                  ]
                }
              },
              {
                "id": "v8eZFG08fE2mdABwH_9rk",
                "title": "子主题1",
                "freshTitle": true,
                "children": {
                  "attached": [
                    {
                      "id": "r-U05HeTW837HY21Wk6mS",
                      "title": "子主题6",
                      "freshTitle": true,
                      "children": {
                        "attached": [
                          {
                            "id": "_zxVhs4diE2umVW-QGQZP",
                            "title": "子主题3",
                            "freshTitle": true,
                            "children": {
                              "attached": [
                                {
                                  "id": "5tw-B2l4fNVt_3TnD_dvs",
                                  "title": "子主题1",
                                  "freshTitle": true,
                                  "children": {
                                    "attached": []
                                  }
                                },
                                {
                                  "id": "gEOPgzieEViIrwI-VmR6P",
                                  "title": "子主题3",
                                  "freshTitle": true,
                                  "children": {
                                    "attached": [
                                      {
                                        "id": "yiWrs6o234n-AFuJRj1OZ",
                                        "title": "子主题4",
                                        "freshTitle": true,
                                        "children": {
                                          "attached": []
                                        }
                                      }
                                    ]
                                  }
                                }
                              ]
                            }
                          }
                        ]
                      }
                    }
                  ]
                }
              }
            ]
          }
        },
        {
          "id": "rCAnp5J3XPF07p9Dvox2i",
          "title": "分支主题7",
          "freshTitle": true,
          "children": {
            "attached": [
              {
                "id": "ccgCW4o964gdQ8_nM3hEN",
                "title": "子主题1",
                "freshTitle": true
              }
            ]
          }
        },
        {
          "id": "08dp_mZ1ViYHNEpqI0MF-",
          "title": "RPG",
          "boundaries": [],
          "children": {
            "attached": [
              {
                "id": "nn2y67RJHiBc6GmNISFO9",
                "title": "武器",
                "boundaries": [],
                "children": {
                  "attached": [
                    {
                      "id": "lfvrgX02Tq3DQleeD7_pf",
                      "title": "解锁新招式：带来丰富的招式和动作战斗体验",
                      "style": {
                        "fontWeight": "bold"
                      }
                    },
                    {
                      "id": "4d8q_DeRoZRmn9QzL0ZjU",
                      "title": "武器解锁",
                      "children": {
                        "attached": [
                          {
                            "id": "3MyY0iZq33EyXsRzcfUZy",
                            "title": "剧情给",
                            "boundaries": []
                          },
                          {
                            "id": "IuH-57Wy5E8jLF_gQ_Kus",
                            "title": "击败boss",
                            "boundaries": []
                          }
                        ]
                      }
                    },
                    {
                      "id": "PlFDjg-mFriYZ9WDt_UCw",
                      "title": "武器成长",
                      "children": {
                        "attached": [
                          {
                            "id": "NUq6bu7vuEiBw85yqNoeM",
                            "title": "获取方式",
                            "children": {
                              "attached": [
                                {
                                  "id": "AzHXHlga6GjLmjsJPjcCb",
                                  "title": "战斗胜利、击败boss"
                                },
                                {
                                  "id": "S8te5cI6UJFsj5KVoVdPL",
                                  "title": "剧情给",
                                  "boundaries": []
                                },
                                {
                                  "id": "bFjWtfXAyoSFx-l7SrIqE",
                                  "title": "角色等级？"
                                }
                              ]
                            },
                            "collapse": false
                          },
                          {
                            "id": "KYXaZnKIuxTnkfikGkOlH",
                            "title": "成长方式",
                            "children": {
                              "attached": [
                                {
                                  "id": "kvEXaG-5c6DKeOJjtW47M",
                                  "title": "通过消耗“技能点”类的特殊资源来进行成长"
                                }
                              ]
                            }
                          },
                          {
                            "id": "VPswXIUv13hcKb5GK_AP7",
                            "title": "成长构成",
                            "children": {
                              "attached": [
                                {
                                  "id": "y_rA7z6oEqrt0-2HSHJrR",
                                  "title": "基础",
                                  "children": {
                                    "attached": [
                                      {
                                        "id": "qUe214mVQpXX7VfX_Y3l-",
                                        "title": "解锁招式"
                                      }
                                    ]
                                  }
                                },
                                {
                                  "id": "6PkP8-A5sv0Lrv9TgQMZg",
                                  "title": "进阶",
                                  "children": {
                                    "attached": [
                                      {
                                        "id": "WJ6RNPgta_1-Y76tYAnqL",
                                        "title": "解锁特殊招式、强化招式"
                                      }
                                    ]
                                  }
                                }
                              ]
                            }
                          }
                        ]
                      },
                      "position": {
                        "x": 0,
                        "y": 42.400000000000006
                      }
                    }
                  ]
                }
              },
              {
                "id": "8gIVvYxy4QbQJoNgutfBL",
                "title": "羁绊技",
                "children": {
                  "attached": [
                    {
                      "id": "uLGhJbyBQuVlvB077kqNw",
                      "title": "给玩家额外的战术技能：减少动作苦手的门槛、扩展战斗体验",
                      "style": {
                        "fontWeight": "bold"
                      }
                    },
                    {
                      "id": "d4lxKpvy2GeM6t9iY3UbE",
                      "title": "获得方式",
                      "children": {
                        "attached": [
                          {
                            "id": "15UudrL91GS8vk55IzBgt",
                            "title": "战斗胜利、击败boss"
                          },
                          {
                            "id": "V_So_OL1wOP_IBd2bB3sR",
                            "title": "地图拾取"
                          },
                          {
                            "id": "3z2JBLq1i2FI36DeG0fju",
                            "title": "剧情给"
                          }
                        ]
                      }
                    },
                    {
                      "id": "RbPWuCheuUMle82yA2WE7",
                      "title": "效果",
                      "children": {
                        "attached": [
                          {
                            "id": "GJYJWYo_5h_a5bS5imYmW",
                            "title": "回血，辅助能力"
                          },
                          {
                            "id": "eW_ZO9TZ1l11IWaUpUHFq",
                            "title": "与动作关联度低的攻击和控制手段",
                            "children": {
                              "attached": []
                            }
                          }
                        ]
                      }
                    }
                  ]
                }
              },
              {
                "id": "i7H6qi1GJgVojvN2r31Xa",
                "title": "结晶",
                "children": {
                  "attached": [
                    {
                      "id": "BLgfe0p-e2zPV6MPV60sX",
                      "title": "给玩家数值向的战斗效果：能够有一定BD组合、个性化的战斗方式选择",
                      "style": {
                        "fontWeight": "bold"
                      }
                    },
                    {
                      "id": "IPTHj-GAQPEVQ_jd2VcOW",
                      "title": "获得方式",
                      "children": {
                        "attached": [
                          {
                            "id": "P1b5M1JqpgRKA055xvpKw",
                            "title": "地图拾取",
                            "boundaries": []
                          },
                          {
                            "id": "C5DKd7P604ApQ_Y3e9-WV",
                            "title": "剧情给",
                            "boundaries": []
                          }
                        ]
                      }
                    },
                    {
                      "id": "_J8UOWepA2tPNU05agxDs",
                      "title": "效果",
                      "boundaries": [],
                      "children": {
                        "attached": [
                          {
                            "id": "18wPqYJsWTBotqBHSlv_W",
                            "title": "以战斗效果、属性数值为主",
                            "boundaries": []
                          },
                          {
                            "id": "p2lf4WLgJfGHSk87HLs2n",
                            "title": "例如",
                            "boundaries": [],
                            "children": {
                              "attached": [
                                {
                                  "id": "lPLCOZoe_vnQO5ekCyVx8",
                                  "title": "对xx敌人有概率眩晕"
                                },
                                {
                                  "id": "gnNeAhtLoa5z3j9Kgsbjd",
                                  "title": "HP、MP增加xx"
                                }
                              ]
                            }
                          }
                        ]
                      }
                    },
                    {
                      "id": "QVq4VzoOIoQK_I2XYuUxw",
                      "title": "使用方式",
                      "boundaries": [],
                      "children": {
                        "attached": [
                          {
                            "id": "ybjFQpk7qVGzJOBZsMaWB",
                            "title": "主角同时最多装备6个",
                            "children": {
                              "attached": []
                            }
                          },
                          {
                            "id": "jO7G2BBjWHjg_1tHGj1ku",
                            "title": "可获得数十种不同的结晶",
                            "boundaries": []
                          }
                        ]
                      }
                    }
                  ]
                },
                "position": {
                  "x": -73.082,
                  "y": -2.0128799999996687
                }
              },
              {
                "id": "sIRlQuTzT0041z9MJVXRN",
                "title": "待定内容",
                "children": {
                  "attached": [
                    {
                      "id": "Y2n1Mou5CtkkkcFYr4Evr",
                      "title": "角色等级",
                      "boundaries": [],
                      "children": {
                        "attached": [
                          {
                            "id": "F8A8cDUY5EGjjxNyVRTJE",
                            "title": "提供基础数值成长：给玩家保底的成长感、容错、带来更丝滑的历程体验",
                            "style": {
                              "fontWeight": "bold"
                            }
                          },
                          {
                            "id": "KBEk1RkR7CJGEeg9iNfXD",
                            "title": "获取方式",
                            "boundaries": [],
                            "children": {
                              "attached": [
                                {
                                  "id": "YXeYq3CueaOoVsLMBawrN",
                                  "title": "战斗胜利",
                                  "boundaries": [],
                                  "children": {
                                    "attached": []
                                  }
                                },
                                {
                                  "id": "ktbOkdFVanUWgQxutvzXY",
                                  "title": "补充途径",
                                  "boundaries": [],
                                  "children": {
                                    "attached": [
                                      {
                                        "id": "7SRPmODhxfZJwiHjJnLpM",
                                        "title": "剧情给",
                                        "boundaries": []
                                      },
                                      {
                                        "id": "v8tLVJx9BejueirjJnjpK",
                                        "title": "地图拾取",
                                        "boundaries": []
                                      }
                                    ]
                                  }
                                }
                              ]
                            }
                          },
                          {
                            "id": "ynhhvqEfmIzA6d4BfF-EO",
                            "title": "效果",
                            "children": {
                              "attached": [
                                {
                                  "id": "Rpd7UscpfuUGBP9BiovGn",
                                  "title": "随等级提升、提升基础属性（攻击、hp）&获得技能点"
                                }
                              ]
                            }
                          }
                        ]
                      }
                    }
                  ]
                }
              }
            ]
          },
          "collapse": false
        },
        {
          "id": "WK56wbwqcWw64YFp0dqWj",
          "title": "体验流程",
          "children": {
            "attached": [
              {
                "id": "ZeiyGR--ZweiFv7dGMPiz",
                "title": "一阶段",
                "children": {
                  "attached": [
                    {
                      "id": "wRbz_6Dw7vofoK0_PKr_4",
                      "title": "主题",
                      "boundaries": [],
                      "children": {
                        "attached": [
                          {
                            "id": "zAZxzavy8H0VGcuXqyyB6",
                            "title": "女孩的成长"
                          }
                        ]
                      }
                    },
                    {
                      "id": "CbLbQhwPdm8Hs0KDY116z",
                      "title": "历程",
                      "children": {
                        "attached": [
                          {
                            "id": "eD7a5W21OoICXG7yoq9QG",
                            "title": "线性历程：随剧情推进的线性关卡箱庭"
                          },
                          {
                            "id": "aFd-VNNGqkAJcUTXmDQlo",
                            "title": "随历程解锁武器、招式"
                          }
                        ]
                      }
                    }
                  ]
                }
              },
              {
                "id": "MjB28ouHQClZ8lTJRoUGz",
                "title": "二阶段",
                "children": {
                  "attached": [
                    {
                      "id": "1nEXJdQjK9ChqQ_Czdjfj",
                      "title": "主题",
                      "children": {
                        "attached": [
                          {
                            "id": "17l-ZvswRAtXT35o-i_qe",
                            "title": "男人的守护和牺牲",
                            "boundaries": []
                          }
                        ]
                      }
                    },
                    {
                      "id": "YSgFyaZxLTIqZD1gZE6ns",
                      "title": "历程",
                      "children": {
                        "attached": [
                          {
                            "id": "QmqiwZnYKhJUOQdbW4wnm",
                            "title": "线性历程：随剧情推进的线性关卡箱庭"
                          }
                        ]
                      }
                    },
                    {
                      "id": "B0_G8HOKAhQ5kWRY06R7m",
                      "title": "与一阶段的区别",
                      "children": {
                        "attached": [
                          {
                            "id": "eiSz1Voht6G8WK44erbM7",
                            "title": "无路线关联"
                          },
                          {
                            "id": "r2fUDXXUldGkiY-ibZTCJ",
                            "title": "历程更短、节奏更快",
                            "boundaries": []
                          },
                          {
                            "id": "cel5glDIEYsQkIFLfX48b",
                            "title": "更多表演性玩法、剧情演出"
                          }
                        ]
                      }
                    }
                  ]
                },
                "collapse": false,
                "markers": [
                  {
                    "markerId": "symbol-question",
                    "id": "lBOUXzqv2gCP0oXFSkrwx",
                    "color": "#f88825"
                  }
                ]
              }
            ]
          },
          "position": {
            "x": 0,
            "y": 142.4
          }
        },
        {
          "id": "FltwGT_EbDiZvMtok0UIB",
          "title": "游戏难度",
          "markers": [
            {
              "markerId": "symbol-question",
              "id": "KvaM86vvOlMbrq9fGk-t5",
              "color": "#f88825"
            }
          ],
          "children": {
            "attached": [
              {
                "id": "cTUSKwIQeTYWXYKXDcaHZ",
                "title": "先把标准难度做好",
                "children": {
                  "attached": [
                    {
                      "id": "m04T_ZYh5cJu1Ssev38CS",
                      "title": "整体游戏沉浸感、动作游戏体验"
                    }
                  ]
                }
              }
            ]
          },
          "collapse": false
        }
      ]
    },
    "style": {
      "color": "#1f1f1f"
    },
    "extensions": {
      "structureClass.unbalanced": {
        "right-number": 5
      }
    },
    "structureClass": "unbalanced"
  },
  "style": {
    "color": "#1f1f1f"
  },
  "extensions": {
    "structureClass.unbalanced": {
      "right-number": 3
    }
  },
  "structureClass": "unbalanced",
  "relationships": [
    {
      "id": "wojspGZJT1M5B6DUeAkil",
      "end1Id": "j-UnEuh1xURbugPCrcLC8",
      "end2Id": "wl8gf7LhbrZqW3k-bRXLB",
      "title": "",
      "controlPoints": {
        "0": {
          "x": 69.34528808593751,
          "y": 199.6172494426869
        },
        "1": {
          "x": 43.6547119140625,
          "y": 90.50640625
        }
      },
      "lineEndPoints": {
        "0": {
          "x": 78,
          "y": 3.1236556926869277
        },
        "1": {
          "x": 29,
          "y": 0
        }
      },
      "style": {
        "lineColor": "#319B62"
      }
    },
    {
      "id": "zLt8bK88bg1dgFGDiHGaU",
      "end1Id": "Vn7TYF-673WJ5Vvd3hkKF",
      "end2Id": "TR_1LJFRQLGWnC7edkxIP",
      "title": "",
      "controlPoints": {
        "0": {
          "x": 221.7328,
          "y": -72.32400000000001
        },
        "1": {
          "x": 273.1602664062497,
          "y": 11.181733602151319
        }
      },
      "lineEndPoints": {
        "0": {
          "x": 0,
          "y": -15.800000000000004
        },
        "1": {
          "x": 95.89306640625,
          "y": 12.657733602151318
        }
      },
      "style": {
        "lineColor": "#319B62"
      }
    }
  ],
  "theme": {
    "topic": "default"
  }
}
