import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import { extractKanbanData, writeKanbanDataToYjs } from './useKanbanYjs'

describe('useKanbanYjs CRDT storage helpers', () => {
  it('keeps concurrent card additions because missing local cards are not treated as deletes', () => {
    const doc = new Y.Doc()
    const yMap = doc.getMap('kanban')

    writeKanbanDataToYjs(yMap, {
      columns: [{ id: 'col-1', title: 'Todo', order: 0 }],
      cards: [{ id: 'card-a', title: 'Card A', columnId: 'col-1', order: 0 }]
    })

    writeKanbanDataToYjs(yMap, {
      columns: [{ id: 'col-1', title: 'Todo', order: 0 }],
      cards: [{ id: 'card-b', title: 'Card B', columnId: 'col-1', order: 1 }]
    })

    const data = extractKanbanData(yMap)

    expect(data.cards.map((card) => card.id).sort()).toEqual(['card-a', 'card-b'])
  })

  it('removes a card only when an explicit tombstone is written', () => {
    const doc = new Y.Doc()
    const yMap = doc.getMap('kanban')

    writeKanbanDataToYjs(yMap, {
      columns: [{ id: 'col-1', title: 'Todo', order: 0 }],
      cards: [
        { id: 'card-a', title: 'Card A', columnId: 'col-1', order: 0 },
        { id: 'card-b', title: 'Card B', columnId: 'col-1', order: 1 }
      ]
    })

    writeKanbanDataToYjs(yMap, {
      columns: [{ id: 'col-1', title: 'Todo', order: 0 }],
      cards: [{ id: 'card-b', title: 'Card B', columnId: 'col-1', order: 1 }]
    }, { deletedCardIds: ['card-a'] })

    const data = extractKanbanData(yMap)

    expect(data.cards.map((card) => card.id)).toEqual(['card-b'])
    expect(yMap.get('__card_card-a')).toMatchObject({ id: 'card-a', __deleted: true })
  })

  it('removes a column only when an explicit tombstone is written', () => {
    const doc = new Y.Doc()
    const yMap = doc.getMap('kanban')

    writeKanbanDataToYjs(yMap, {
      columns: [
        { id: 'col-1', title: 'Todo', order: 0 },
        { id: 'col-2', title: 'Done', order: 1 }
      ],
      cards: []
    })

    writeKanbanDataToYjs(yMap, {
      columns: [{ id: 'col-2', title: 'Done', order: 0 }],
      cards: []
    }, { deletedColumnIds: ['col-1'] })

    const data = extractKanbanData(yMap)

    expect(data.columns.map((column) => column.id)).toEqual(['col-2'])
    expect(yMap.get('__col_col-1')).toMatchObject({ id: 'col-1', __deleted: true })
  })
})
