import { CONSTANTS } from 'simple-mind-map/src/constants/constant'

export function getBalancedRightNumber(childrenLength) {
  if (!childrenLength || childrenLength <= 0) return 0
  return Math.ceil(childrenLength / 2)
}

class UnbalancedLayoutPlugin {
  constructor(opt) {
    this.opt = opt
    this.mindMap = opt.mindMap
    this._childrenSnapshot = null
    this._isDragging = false
    this.init()
  }

  init() {
    this.afterExecCommand = this.afterExecCommand.bind(this)
    this.beforeExecCommand = this.beforeExecCommand.bind(this)
    this.layoutChange = this.layoutChange.bind(this)
    this.beforeSetData = this.beforeSetData.bind(this)
    this.beforeUpdateData = this.beforeUpdateData.bind(this)
    this.onDragStart = this.onDragStart.bind(this)
    this.onDragEnd = this.onDragEnd.bind(this)

    const mindMap = this.mindMap
    const originalExecCommand = mindMap.execCommand.bind(mindMap)
    mindMap.execCommand = function (name, ...args) {
      mindMap.emit('beforeExecCommand', name)
      return originalExecCommand(name, ...args)
    }

    this.mindMap.on('beforeExecCommand', this.beforeExecCommand)
    this.mindMap.on('layout_change', this.layoutChange)
    this.mindMap.on('afterExecCommand', this.afterExecCommand)
    this.mindMap.on('before_update_data', this.beforeUpdateData)
    this.mindMap.on('before_set_data', this.beforeSetData)
    this.mindMap.on('node_dragging', this.onDragStart)
    this.mindMap.on('node_dragend', this.onDragEnd)
  }

  restore() {
    this.mindMap.off('layout_change', this.layoutChange)
    this.mindMap.off('afterExecCommand', this.afterExecCommand)
    this.mindMap.off('before_update_data', this.beforeUpdateData)
    this.mindMap.off('before_set_data', this.beforeSetData)
    this.mindMap.off('beforeExecCommand', this.beforeExecCommand)
    this.mindMap.off('node_dragging', this.onDragStart)
    this.mindMap.off('node_dragend', this.onDragEnd)
  }

  getRightNumber(tree) {
    return tree?.data?.rightNumber
  }

  onDragStart() {
    this._isDragging = true
  }

  onDragEnd() {
    this._isDragging = false
  }

  beforeExecCommand(name) {
    if (name === 'MOVE_NODE_TO' || name === 'INSERT_AFTER' || name === 'INSERT_BEFORE') {
      const tree = this.mindMap.renderer.renderTree
      this._childrenSnapshot = tree?.children?.map(c => ({
        uid: c.data.uid || c.data.text,
        dir: c.data.dir
      })) || []
    }
  }

  afterExecCommand(name) {
    if (!this.isMindMapLayout()) return
    if (this._isDragging) {
      if (name === 'MOVE_NODE_TO' || name === 'INSERT_AFTER' || name === 'INSERT_BEFORE') {
        this.handleNodeMoved()
      }
      return
    }

    if (this.isAutomaticRootChildChange(name)) {
      this.rebalanceRootChildren()
      return
    }

    const commands = [
      'INSERT_NODE', 'INSERT_MULTI_NODE', 'INSERT_CHILD_NODE',
      'INSERT_MULTI_CHILD_NODE', 'INSERT_PARENT_NODE',
      'UP_NODE', 'DOWN_NODE', 'MOVE_UP_ONE_LEVEL',
      'REMOVE_NODE', 'REMOVE_CURRENT_NODE',
      'PASTE_NODE', 'CUT_NODE'
    ]
    if (!commands.includes(name)) return
    this.updateRenderTree()
  }

  isAutomaticRootChildChange(name) {
    return [
      'INSERT_NODE',
      'INSERT_MULTI_NODE',
      'INSERT_CHILD_NODE',
      'INSERT_MULTI_CHILD_NODE',
      'REMOVE_NODE',
      'REMOVE_CURRENT_NODE',
      'PASTE_NODE',
      'CUT_NODE'
    ].includes(name)
  }

  rebalanceRootChildren() {
    const tree = this.mindMap.renderer.renderTree
    if (!tree?.children) return
    tree.data.rightNumber = getBalancedRightNumber(tree.children.length)
    this.updateNodeTree(tree)
    this.mindMap.render()
  }

  handleNodeMoved() {
    const tree = this.mindMap.renderer.renderTree
    if (!tree?.children || !this._childrenSnapshot?.length) return

    const oldRightNumber = this.getRightNumber(tree) || getBalancedRightNumber(tree.children.length)
    const oldOrder = this._childrenSnapshot.map(s => s.uid)
    const newOrder = tree.children.map(c => c.data.uid || c.data.text)

    for (let i = 0; i < oldOrder.length; i++) {
      if (oldOrder[i] !== newOrder[i]) {
        const oldNode = oldOrder[i]
        const newNode = newOrder[i]
        const oldNodeNewIndex = newOrder.indexOf(oldNode)
        const newNodeOldIndex = oldOrder.indexOf(newNode)

        let draggedOldIndex, draggedNewIndex
        if (oldNodeNewIndex >= newNodeOldIndex) {
          draggedOldIndex = i
          draggedNewIndex = oldNodeNewIndex
        } else {
          draggedOldIndex = newNodeOldIndex
          draggedNewIndex = i
        }

        if (draggedOldIndex < oldRightNumber && draggedNewIndex >= oldRightNumber) {
          tree.data.rightNumber = Math.max(1, oldRightNumber - 1)
        } else if (draggedOldIndex >= oldRightNumber && draggedNewIndex < oldRightNumber) {
          tree.data.rightNumber = Math.min(tree.children.length - 1, oldRightNumber + 1)
        }
        break
      }
    }

    this.updateNodeTree(tree)
  }

  layoutChange(layout) {
    if (layout === CONSTANTS.LAYOUT.MIND_MAP) {
      this.updateRenderTree()
    }
  }

  updateRenderTree() {
    this.updateNodeTree(this.mindMap.renderer.renderTree)
    this.mindMap.render()
  }

  beforeSetData(data) {
    if (this.isMindMapLayout()) {
      this.updateNodeTree(data)
    }
  }

  beforeUpdateData(data) {
    if (this.isMindMapLayout()) {
      this.updateNodeTree(data)
    }
  }

  updateNodeTree(tree) {
    if (!this.isMindMapLayout() || !tree?.children) return
    const childrenLength = tree.children.length
    if (childrenLength <= 0) return

    const rightNumber = this.getRightNumber(tree)
    const center = rightNumber != null
      ? Math.min(rightNumber, childrenLength)
      : getBalancedRightNumber(childrenLength)

    tree.children.forEach((item, index) => {
      item.data.dir = index + 1 <= center
        ? CONSTANTS.LAYOUT_GROW_DIR.RIGHT
        : CONSTANTS.LAYOUT_GROW_DIR.LEFT
    })
  }

  isMindMapLayout() {
    return this.mindMap.opt.layout === CONSTANTS.LAYOUT.MIND_MAP
  }

  beforePluginRemove() {
    this.restore()
  }

  beforePluginDestroy() {
    this.restore()
  }
}

UnbalancedLayoutPlugin.instanceName = 'unbalancedLayoutPlugin'

export default UnbalancedLayoutPlugin
