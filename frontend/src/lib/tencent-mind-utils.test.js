import { describe, it, expect } from 'vitest'
import { tencentToSimpleMindMap, simpleMindMapToTencent, DEFAULT_TENCENT_MIND } from './tencent-mind-utils'

describe('tencent-mind-utils', () => {
  describe('tencentToSimpleMindMap', () => {
    it('should convert Tencent format to simple-mind-map format', () => {
      const result = tencentToSimpleMindMap(DEFAULT_TENCENT_MIND)
      expect(result).toHaveProperty('data')
      expect(result.data).toHaveProperty('text', 'EE2')
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
  })

  describe('round-trip conversion', () => {
    it('should preserve data through tencent → smm → tencent round-trip', () => {
      const tencentData = DEFAULT_TENCENT_MIND
      const smmData = tencentToSimpleMindMap(tencentData)
      const result = simpleMindMapToTencent(smmData, tencentData)

      // Root topic should have the same ID
      expect(result.rootTopic.id).toBe(tencentData.rootTopic.id)

      // Root topic should have the same text
      expect(result.rootTopic.title.children[0].children[0].text).toBe('EE2')
    })

    it('should preserve relationships through round-trip', () => {
      const tencentData = DEFAULT_TENCENT_MIND
      const smmData = tencentToSimpleMindMap(tencentData)
      const result = simpleMindMapToTencent(smmData, tencentData)

      expect(result.relationships).toEqual(tencentData.relationships)
    })
  })
})
