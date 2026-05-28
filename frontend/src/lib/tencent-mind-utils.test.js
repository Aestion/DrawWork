import { describe, it, expect } from 'vitest'
import { tencentToSimpleMindMap, simpleMindMapToTencent, DEFAULT_TENCENT_MIND } from './tencent-mind-utils'

describe('tencent-mind-utils', () => {
  describe('tencentToSimpleMindMap', () => {
    it('should convert Tencent format to simple-mind-map format', () => {
      const result = tencentToSimpleMindMap(DEFAULT_TENCENT_MIND)
      expect(result).toHaveProperty('data')
      expect(result.data).toHaveProperty('text', '中心主题')
    })

    it('should keep the default TencentMind template minimal', () => {
      const result = tencentToSimpleMindMap(DEFAULT_TENCENT_MIND)

      expect(result.data.text).toBe('中心主题')
      expect(result.children).toHaveLength(1)
      expect(result.children[0].data.text).toBe('子节点')
      expect(result.children[0].children || []).toHaveLength(0)
      expect(DEFAULT_TENCENT_MIND.relationships).toEqual([])
      expect(JSON.stringify(DEFAULT_TENCENT_MIND)).not.toContain('EE2')
      expect(JSON.stringify(DEFAULT_TENCENT_MIND)).not.toContain('RPG')
    })

    it('should handle null/undefined input gracefully', () => {
      const result = tencentToSimpleMindMap(null)
      expect(result.data.text).toBe('中心主题')
    })

    it('should preserve node children', () => {
      const result = tencentToSimpleMindMap(DEFAULT_TENCENT_MIND)
      expect(result.children).toBeDefined()
      expect(result.children.length).toBeGreaterThan(0)
    })

    it('should extract text from Tencent title format', () => {
      const tencentData = {
        rootTopic: {
          id: 'root',
          title: {
            children: [{
              type: 'paragraph',
              children: [{ type: 'text', text: 'Test Title' }]
            }]
          },
          children: { attached: [], detached: [] }
        }
      }
      const result = tencentToSimpleMindMap(tencentData)
      expect(result.data.text).toBe('Test Title')
    })

    it('should preserve markers in _tencentMeta', () => {
      const result = tencentToSimpleMindMap(DEFAULT_TENCENT_MIND)
      // The root node has no markers, but check the structure exists
      expect(result.data).toHaveProperty('_tencentMeta')
    })

    it('should convert Tencent markers to simple-mind-map icons', () => {
      const tencentData = {
        rootTopic: {
          id: 'root',
          title: 'Root',
          children: {
            attached: [{
              id: 'child1',
              title: 'Child',
              markers: [{ markerId: 'symbol-question', id: 'marker1', color: '#f88825' }],
              children: { attached: [], detached: [] }
            }],
            detached: []
          }
        }
      }

      const result = tencentToSimpleMindMap(tencentData)

      expect(result.children[0].data.icon).toEqual(['tencent_question'])
    })

    it('should convert Tencent generalization extensions to simple-mind-map data', () => {
      const summary = [{ text: 'Summary', range: [0, 1] }]
      const tencentData = {
        rootTopic: {
          id: 'root',
          title: 'Root',
          children: {
            attached: [{
              id: 'child1',
              title: 'Child',
              extensions: { 'drawwork.generalization': summary },
              children: { attached: [], detached: [] }
            }],
            detached: []
          }
        }
      }

      const result = tencentToSimpleMindMap(tencentData)

      expect(result.children[0].data.generalization).toEqual(summary)
    })

    it('should convert Tencent root boundaries to child outerFrame data', () => {
      const tencentData = {
        rootTopic: {
          id: 'root',
          title: 'Root',
          boundaries: [{ range: [0, 1], strokeColor: '#0984e3', fill: 'rgba(9,132,227,0.05)' }],
          children: {
            attached: [
              { id: 'child1', title: 'Child 1', children: { attached: [], detached: [] } },
              { id: 'child2', title: 'Child 2', children: { attached: [], detached: [] } }
            ],
            detached: []
          }
        }
      }

      const result = tencentToSimpleMindMap(tencentData)

      expect(result.children[0].data.outerFrame).toMatchObject({ groupId: 'boundary_0', strokeColor: '#0984e3' })
      expect(result.children[1].data.outerFrame).toMatchObject({ groupId: 'boundary_0', strokeColor: '#0984e3' })
    })

    it('should handle collapse state', () => {
      const tencentData = {
        rootTopic: {
          id: 'root',
          title: { children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Root' }] }] },
          collapse: true,
          children: {
            attached: [{
              id: 'child1',
              title: 'Child',
              children: { attached: [], detached: [] }
            }],
            detached: []
          }
        }
      }
      const result = tencentToSimpleMindMap(tencentData)
      expect(result.data.expand).toBe(false)
    })

    it('should preserve unbalanced layout direction', () => {
      const result = tencentToSimpleMindMap(DEFAULT_TENCENT_MIND)
      // DEFAULT_TENCENT_MIND has structureClass: 'unbalanced' with right-number
      expect(result.data).toHaveProperty('rightNumber')
    })
  })

  describe('simpleMindMapToTencent', () => {
    it('should convert simple-mind-map format back to Tencent format', () => {
      const smmData = {
        data: { text: 'Root Node', _tencentMeta: { id: 'root' } },
        children: [{
          data: { text: 'Child 1', _tencentMeta: { id: 'child1' } },
          children: []
        }]
      }
      const result = simpleMindMapToTencent(smmData, DEFAULT_TENCENT_MIND)
      expect(result).toHaveProperty('rootTopic')
      expect(result.rootTopic.id).toBe('root')
    })

    it('should return original data when smmData is null', () => {
      const result = simpleMindMapToTencent(null, DEFAULT_TENCENT_MIND)
      expect(result).toBe(DEFAULT_TENCENT_MIND)
    })

    it('should preserve relationships from original data', () => {
      const smmData = {
        data: { text: 'Root', _tencentMeta: { id: 'root' } },
        children: []
      }
      const result = simpleMindMapToTencent(smmData, DEFAULT_TENCENT_MIND)
      expect(result.relationships).toBeDefined()
      expect(Array.isArray(result.relationships)).toBe(true)
    })

    it('should preserve theme from original data', () => {
      const smmData = {
        data: { text: 'Root', _tencentMeta: { id: 'root' } },
        children: []
      }
      const result = simpleMindMapToTencent(smmData, DEFAULT_TENCENT_MIND)
      expect(result.theme).toBeDefined()
    })

    it('should save root child sides using right-number and right-first order', () => {
      const smmData = {
        data: {
          text: 'Root',
          _tencentMeta: {
            id: 'root',
            extensions: {
              'structureClass.unbalanced': {
                'right-number': 1
              }
            },
            structureClass: 'unbalanced'
          }
        },
        children: [
          { data: { text: '左 1', dir: 'left', _tencentMeta: { id: 'l1' } }, children: [] },
          { data: { text: '右 1', dir: 'right', _tencentMeta: { id: 'r1' } }, children: [] },
          { data: { text: '右 2', dir: 'right', _tencentMeta: { id: 'r2' } }, children: [] },
          { data: { text: '左 2', dir: 'left', _tencentMeta: { id: 'l2' } }, children: [] }
        ]
      }

      const result = simpleMindMapToTencent(smmData, DEFAULT_TENCENT_MIND)

      expect(result.rootTopic.extensions['structureClass.unbalanced']['right-number']).toBe(2)
      expect(result.rootTopic.children.attached.map(child => child.id)).toEqual(['r1', 'r2', 'l1', 'l2'])
    })

    it('should reconstruct boundaries from outerFrame data', () => {
      const smmData = {
        data: { text: 'Root', _tencentMeta: { id: 'root' } },
        children: [
          {
            data: {
              text: 'Child 1',
              _tencentMeta: { id: 'child1' },
              outerFrame: { groupId: 'frame1', strokeColor: '#0984e3' }
            },
            children: []
          },
          {
            data: {
              text: 'Child 2',
              _tencentMeta: { id: 'child2' },
              outerFrame: { groupId: 'frame1', strokeColor: '#0984e3' }
            },
            children: []
          }
        ]
      }
      const result = simpleMindMapToTencent(smmData, null)
      // Boundaries should be reconstructed at root level
      expect(result.rootTopic.boundaries).toBeDefined()
      expect(result.rootTopic.boundaries.length).toBe(1)
      expect(result.rootTopic.boundaries[0].range).toEqual([0, 1])
    })

    it('should remove stale root boundaries when no child has an outerFrame', () => {
      const smmData = {
        data: {
          text: 'Root',
          _tencentMeta: {
            id: 'root',
            boundaries: [{ range: [0, 1], strokeColor: '#0984e3' }]
          }
        },
        children: [
          { data: { text: 'Child 1', _tencentMeta: { id: 'child1' } }, children: [] },
          { data: { text: 'Child 2', _tencentMeta: { id: 'child2' } }, children: [] }
        ]
      }

      const result = simpleMindMapToTencent(smmData, null)

      expect(result.rootTopic.boundaries).toBeUndefined()
    })

    it('should save current marker icons instead of stale marker metadata', () => {
      const smmData = {
        data: { text: 'Root', _tencentMeta: { id: 'root' } },
        children: [{
          data: {
            text: 'Child',
            icon: ['tencent_question'],
            _tencentMeta: {
              id: 'child1',
              markers: [{ markerId: 'symbol-star', id: 'old-marker', color: '#f1c40f' }]
            }
          },
          children: []
        }]
      }

      const result = simpleMindMapToTencent(smmData, null)
      const child = result.rootTopic.children.attached[0]

      expect(child.markers).toHaveLength(1)
      expect(child.markers[0].markerId).toBe('symbol-question')
    })

    it('should preserve marker metadata when marker icons are unchanged', () => {
      const smmData = {
        data: { text: 'Root', _tencentMeta: { id: 'root' } },
        children: [{
          data: {
            text: 'Child',
            icon: ['tencent_question'],
            _tencentMeta: {
              id: 'child1',
              markers: [{ markerId: 'symbol-question', id: 'existing-marker', color: '#f88825' }]
            }
          },
          children: []
        }]
      }

      const result = simpleMindMapToTencent(smmData, null)

      expect(result.rootTopic.children.attached[0].markers).toEqual([
        { markerId: 'symbol-question', id: 'existing-marker', color: '#f88825' }
      ])
    })

    it('should preserve a marked node subtree when saving marker metadata', () => {
      const smmData = {
        data: { text: 'Root', _tencentMeta: { id: 'root' } },
        children: [{
          data: {
            text: 'Marked Parent',
            icon: ['tencent_question'],
            _tencentMeta: { id: 'marked-parent' }
          },
          children: [
            { data: { text: 'Child 1', _tencentMeta: { id: 'child1' } }, children: [] },
            { data: { text: 'Child 2', _tencentMeta: { id: 'child2' } }, children: [] }
          ]
        }]
      }

      const result = simpleMindMapToTencent(smmData, null)
      const parent = result.rootTopic.children.attached[0]

      expect(parent.markers).toEqual([expect.objectContaining({ markerId: 'symbol-question' })])
      expect(parent.children.attached.map(child => child.id)).toEqual(['child1', 'child2'])
    })

    it('should remove stale marker metadata when all icons are removed', () => {
      const smmData = {
        data: { text: 'Root', _tencentMeta: { id: 'root' } },
        children: [{
          data: {
            text: 'Child',
            _tencentMeta: {
              id: 'child1',
              markers: [{ markerId: 'symbol-question', id: 'old-marker', color: '#f88825' }]
            }
          },
          children: []
        }]
      }

      const result = simpleMindMapToTencent(smmData, null)

      expect(result.rootTopic.children.attached[0].markers).toBeUndefined()
    })

    it('should save current generalization data instead of stale extension metadata', () => {
      const smmData = {
        data: { text: 'Root', _tencentMeta: { id: 'root' } },
        children: [{
          data: {
            text: 'Child',
            generalization: [{ text: 'New summary', range: [0, 1] }],
            _tencentMeta: {
              id: 'child1',
              extensions: {
                'drawwork.generalization': [{ text: 'Old summary', range: [0, 0] }]
              }
            }
          },
          children: []
        }]
      }

      const result = simpleMindMapToTencent(smmData, null)
      const child = result.rootTopic.children.attached[0]

      expect(child.extensions['drawwork.generalization']).toEqual([{ text: 'New summary', range: [0, 1] }])
    })

    it('should preserve all regular children when saving a node with generalization metadata', () => {
      const smmData = {
        data: { text: 'Root', _tencentMeta: { id: 'root' } },
        children: [{
          data: {
            text: 'Parent',
            generalization: [{ text: 'Summary', range: [0, 1] }],
            _tencentMeta: { id: 'parent' }
          },
          children: [
            { data: { text: 'Child 1', _tencentMeta: { id: 'child1' } }, children: [] },
            { data: { text: 'Child 2', _tencentMeta: { id: 'child2' } }, children: [] },
            { data: { text: 'Child 3', _tencentMeta: { id: 'child3' } }, children: [] }
          ]
        }]
      }

      const result = simpleMindMapToTencent(smmData, null)
      const parent = result.rootTopic.children.attached[0]

      expect(parent.children.attached.map(child => child.id)).toEqual(['child1', 'child2', 'child3'])
      expect(parent.extensions['drawwork.generalization']).toEqual([{ text: 'Summary', range: [0, 1] }])
    })

    it('should preserve a media node subtree when saving media metadata', () => {
      const smmData = {
        data: { text: 'Root', _tencentMeta: { id: 'root' } },
        children: [{
          data: {
            text: 'Media Parent',
            _uploadId: 'upload-gif',
            _mediaType: 'image',
            _imageSize: { width: 64, height: 48, custom: true },
            _tencentMeta: { id: 'media-parent' }
          },
          children: [
            { data: { text: 'Child 1', _tencentMeta: { id: 'child1' } }, children: [] },
            { data: { text: 'Child 2', _tencentMeta: { id: 'child2' } }, children: [] }
          ]
        }]
      }

      const result = simpleMindMapToTencent(smmData, null)
      const parent = result.rootTopic.children.attached[0]

      expect(parent.extensions['drawwork.media']).toEqual({
        uploadId: 'upload-gif',
        mediaType: 'image',
        imageSize: { width: 64, height: 48, custom: true }
      })
      expect(parent.children.attached.map(child => child.id)).toEqual(['child1', 'child2'])
    })

    it('should preserve outer-frame child subtrees while reconstructing boundaries', () => {
      const frame = { groupId: 'frame1', strokeColor: '#0984e3' }
      const smmData = {
        data: { text: 'Root', _tencentMeta: { id: 'root' } },
        children: [
          {
            data: { text: 'Frame Parent 1', outerFrame: frame, _tencentMeta: { id: 'parent1' } },
            children: [{ data: { text: 'Nested 1', _tencentMeta: { id: 'nested1' } }, children: [] }]
          },
          {
            data: { text: 'Frame Parent 2', outerFrame: frame, _tencentMeta: { id: 'parent2' } },
            children: [{ data: { text: 'Nested 2', _tencentMeta: { id: 'nested2' } }, children: [] }]
          }
        ]
      }

      const result = simpleMindMapToTencent(smmData, null)

      expect(result.rootTopic.boundaries[0].range).toEqual([0, 1])
      expect(result.rootTopic.children.attached[0].children.attached.map(child => child.id)).toEqual(['nested1'])
      expect(result.rootTopic.children.attached[1].children.attached.map(child => child.id)).toEqual(['nested2'])
    })

    it('should preserve node structure while keeping relationships from original data', () => {
      const smmData = {
        data: { text: 'Root', _tencentMeta: { id: 'root' } },
        children: [
          {
            data: { text: 'Source', _tencentMeta: { id: 'source' } },
            children: [{ data: { text: 'Source Child', _tencentMeta: { id: 'source-child' } }, children: [] }]
          },
          {
            data: { text: 'Target', _tencentMeta: { id: 'target' } },
            children: [{ data: { text: 'Target Child', _tencentMeta: { id: 'target-child' } }, children: [] }]
          }
        ]
      }
      const origTencentData = {
        relationships: [{ id: 'rel1', end1Id: 'source', end2Id: 'target', title: 'Related' }]
      }

      const result = simpleMindMapToTencent(smmData, origTencentData)

      expect(result.relationships).toEqual(origTencentData.relationships)
      expect(result.rootTopic.children.attached[0].children.attached.map(child => child.id)).toEqual(['source-child'])
      expect(result.rootTopic.children.attached[1].children.attached.map(child => child.id)).toEqual(['target-child'])
    })

    it('should remove stale generalization extension when the summary is removed', () => {
      const smmData = {
        data: { text: 'Root', _tencentMeta: { id: 'root' } },
        children: [{
          data: {
            text: 'Child',
            _tencentMeta: {
              id: 'child1',
              extensions: {
                'drawwork.generalization': [{ text: 'Old summary', range: [0, 0] }]
              }
            }
          },
          children: []
        }]
      }

      const result = simpleMindMapToTencent(smmData, null)

      expect(result.rootTopic.children.attached[0].extensions?.['drawwork.generalization']).toBeUndefined()
    })

    it('should save edited text instead of stale rich text metadata', () => {
      const smmData = {
        data: {
          text: 'Edited Root',
          _tencentMeta: {
            id: 'root',
            richText: [{ text: 'Old Root', color: '#1f1f1f' }]
          }
        },
        children: [{
          data: {
            text: 'Edited Child',
            _tencentMeta: {
              id: 'child1',
              richText: [{ text: 'Old Child', color: '#1f1f1f' }]
            }
          },
          children: []
        }]
      }

      const result = simpleMindMapToTencent(smmData, null)

      expect(result.rootTopic.title.children[0].children[0].text).toBe('Edited Root')
      expect(result.rootTopic.children.attached[0].title.children[0].children[0].text).toBe('Edited Child')
    })

    it('should preserve media metadata on multiple sibling nodes', () => {
      const smmData = {
        data: { text: 'Root', _tencentMeta: { id: 'root' } },
        children: [
          {
            data: {
              text: 'Image Child',
              _uploadId: 'gif-upload',
              _mediaType: 'image',
              _imageSize: { width: 32, height: 32, custom: true },
              _tencentMeta: { id: 'child1' }
            },
            children: []
          },
          {
            data: {
              text: 'Video Child',
              _uploadId: 'video-upload',
              _mediaType: 'video',
              _imageSize: { width: 120, height: 80, custom: true },
              _tencentMeta: { id: 'child2' }
            },
            children: []
          }
        ]
      }

      const result = simpleMindMapToTencent(smmData, null)
      const [first, second] = result.rootTopic.children.attached

      expect(first.extensions['drawwork.media']).toEqual({
        uploadId: 'gif-upload',
        mediaType: 'image',
        imageSize: { width: 32, height: 32, custom: true }
      })
      expect(second.extensions['drawwork.media']).toEqual({
        uploadId: 'video-upload',
        mediaType: 'video',
        imageSize: { width: 120, height: 80, custom: true }
      })
    })
  })

  describe('round-trip conversion', () => {
    it('should preserve data through tencent → smm → tencent round-trip', () => {
      const tencentData = DEFAULT_TENCENT_MIND
      const smmData = tencentToSimpleMindMap(tencentData)
      const result = simpleMindMapToTencent(smmData, tencentData)

      // Root topic should have the same ID
      expect(result.rootTopic.id).toBe(tencentData.rootTopic.id)

      // Root topic should have the same text
      expect(result.rootTopic.title.children[0].children[0].text).toBe('中心主题')
    })

    it('should preserve relationships through round-trip', () => {
      const tencentData = DEFAULT_TENCENT_MIND
      const smmData = tencentToSimpleMindMap(tencentData)
      const result = simpleMindMapToTencent(smmData, tencentData)

      expect(result.relationships).toEqual(tencentData.relationships)
    })
  })
})
