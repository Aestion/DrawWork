export function nextElementPosition(laneElements, colWidth = 120, rowHeight = 80, cols = 3) {
  const count = laneElements.length
  const col = count % cols
  const row = Math.floor(count / cols)
  return {
    x: 10 + col * colWidth,
    y: 10 + row * rowHeight
  }
}
