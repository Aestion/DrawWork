import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import { elementsToYjs, extractSwimlaneData, writeSwimlaneDataToYjs, yjsToElements } from './useSwimlaneYjs'

describe('useSwimlaneYjs CRDT storage helpers', () => {
  it('preserves swimlane element display fields through Yjs conversion', () => {
    const source = [{
      id: 'el-1',
      laneId: 'lane-1',
      text: 'Draft API',
      targetId: 'el-2',
      x: 24,
      y: 48,
      order: 0
    }]

    expect(yjsToElements(elementsToYjs(source))).toEqual([
      expect.objectContaining({
        id: 'el-1',
        laneId: 'lane-1',
        text: 'Draft API',
        targetId: 'el-2',
        x: 24,
        y: 48,
        order: 0
      })
    ])
  })

  it('keeps concurrent element additions because missing local elements are not treated as deletes', () => {
    const doc = new Y.Doc()
    const yMap = doc.getMap('swimlane')

    writeSwimlaneDataToYjs(yMap, {
      direction: 'horizontal',
      lanes: [{ id: 'lane-1', title: 'Lane', order: 0 }],
      elements: [{ id: 'el-a', laneId: 'lane-1', text: 'A', x: 0, y: 0, order: 0 }]
    })

    writeSwimlaneDataToYjs(yMap, {
      direction: 'horizontal',
      lanes: [{ id: 'lane-1', title: 'Lane', order: 0 }],
      elements: [{ id: 'el-b', laneId: 'lane-1', text: 'B', x: 20, y: 0, order: 1 }]
    })

    const data = extractSwimlaneData(yMap)

    expect(data.elements.map((el) => el.id).sort()).toEqual(['el-a', 'el-b'])
  })

  it('removes lanes and elements only when explicit tombstones are written', () => {
    const doc = new Y.Doc()
    const yMap = doc.getMap('swimlane')

    writeSwimlaneDataToYjs(yMap, {
      direction: 'vertical',
      lanes: [
        { id: 'lane-1', title: 'One', order: 0 },
        { id: 'lane-2', title: 'Two', order: 1 }
      ],
      elements: [
        { id: 'el-a', laneId: 'lane-1', text: 'A', order: 0 },
        { id: 'el-b', laneId: 'lane-2', text: 'B', order: 1 }
      ]
    })

    writeSwimlaneDataToYjs(yMap, {
      direction: 'vertical',
      lanes: [{ id: 'lane-2', title: 'Two', order: 0 }],
      elements: [{ id: 'el-b', laneId: 'lane-2', text: 'B', order: 0 }]
    }, { deletedLaneIds: ['lane-1'], deletedElementIds: ['el-a'] })

    const data = extractSwimlaneData(yMap)

    expect(data.lanes.map((lane) => lane.id)).toEqual(['lane-2'])
    expect(data.elements.map((el) => el.id)).toEqual(['el-b'])
    expect(yMap.get('__sl_lane_lane-1')).toMatchObject({ id: 'lane-1', __deleted: true })
    expect(yMap.get('__sl_elem_el-a')).toMatchObject({ id: 'el-a', __deleted: true })
  })
})
