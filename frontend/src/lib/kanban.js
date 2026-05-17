export function moveCard(cards, cardId, targetColId) {
  const updated = cards.map(c => {
    if (c.id === cardId) {
      return { ...c, columnId: targetColId }
    }
    return c
  })

  const columns = [...new Set(updated.map(c => c.columnId))]
  const result = []
  for (const colId of columns) {
    const colCards = updated
      .filter(c => c.columnId === colId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    colCards.forEach((c, idx) => {
      result.push({ ...c, order: idx })
    })
  }
  return result
}
