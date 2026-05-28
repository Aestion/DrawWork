import { CONSTANTS } from 'simple-mind-map/src/constants/constant'

export function getBalancedRightNumber(childrenLength) {
  if (!childrenLength || childrenLength <= 0) return 0
  return Math.ceil(childrenLength / 2)
}

export function chooseSideForNewRootChild(rightCount, leftCount) {
  return rightCount <= leftCount ? 'right' : 'left'
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
      mindMap.emit('beforeExecCommand', name, ...args)
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
    this.syncRenderedRootChildDirections()
  }

  onDragEnd() {
    this._isDragging = false
  }

  beforeExecCommand(name, ...args) {
    if (
      name === 'MOVE_NODE_TO' ||
      name === 'INSERT_AFTER' ||
      name === 'INSERT_BEFORE' ||
      this.isAutomaticRootChildChange(name)
    ) {
      const tree = this.mindMap.renderer.renderTree
      this._childrenSnapshot = tree?.children?.map(c => ({
        uid: this.getNodeUid(c),
        dir: this.getNodeSide(c)
      })) || []
      this._movingNodeUids = this.getNodeListUids(args[0])
    }
  }

  afterExecCommand(name, ...args) {
    if (!this.isMindMapLayout()) return
    if (this._isDragging) {
      if (name === 'MOVE_NODE_TO' || name === 'INSERT_AFTER' || name === 'INSERT_BEFORE') {
        this.handleNodeMoved(name, ...args)
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
    this.keepExistingSidesAndPlaceNewChildren(tree)
    this.updateNodeTree(tree)
    this.mindMap.render()
  }

  keepExistingSidesAndPlaceNewChildren(tree) {
    const previousDirs = new Map((this._childrenSnapshot || []).map(item => [item.uid, item.dir]))
    let rightCount = 0
    let leftCount = 0

    for (const child of tree.children) {
      const data = this.getNodeData(child)
      const uid = this.getNodeUid(child)
      const previousDir = previousDirs.get(uid)
      if (previousDir === CONSTANTS.LAYOUT_GROW_DIR.RIGHT || previousDir === 'right') {
        this.setNodeSide(child, CONSTANTS.LAYOUT_GROW_DIR.RIGHT)
        rightCount += 1
      } else if (previousDir === CONSTANTS.LAYOUT_GROW_DIR.LEFT || previousDir === 'left') {
        this.setNodeSide(child, CONSTANTS.LAYOUT_GROW_DIR.LEFT)
        leftCount += 1
      }
    }

    for (const child of tree.children) {
      const data = this.getNodeData(child)
      const uid = this.getNodeUid(child)
      if (previousDirs.has(uid) && data?.dir) continue
      const side = chooseSideForNewRootChild(rightCount, leftCount)
      this.setNodeSide(child, side === 'right'
        ? CONSTANTS.LAYOUT_GROW_DIR.RIGHT
        : CONSTANTS.LAYOUT_GROW_DIR.LEFT)
      if (side === 'right') rightCount += 1
      else leftCount += 1
    }

    this.normalizeRootChildrenByDir(tree)
  }

  handleNodeMoved(name, ...args) {
    const tree = this.mindMap.renderer.renderTree
    if (!tree?.children || !this._childrenSnapshot?.length) return

    const previousDirs = new Map(this._childrenSnapshot.map(item => [item.uid, item.dir]))
    const movingNodeUids = this.getNodeListUids(args[0])
    const movedUids = new Set(movingNodeUids.length > 0 ? movingNodeUids : this._movingNodeUids || [])
    const targetSide = this.getNodeSide(args[1]) || this.inferMovedSide(tree, movedUids, previousDirs)

    for (const child of tree.children) {
      const data = this.getNodeData(child)
      const uid = this.getNodeUid(child)
      const previousDir = previousDirs.get(uid)
      if (movedUids.has(uid) && targetSide) {
        this.setNodeSide(child, targetSide)
      } else if (previousDir === CONSTANTS.LAYOUT_GROW_DIR.RIGHT || previousDir === 'right') {
        this.setNodeSide(child, CONSTANTS.LAYOUT_GROW_DIR.RIGHT)
      } else if (previousDir === CONSTANTS.LAYOUT_GROW_DIR.LEFT || previousDir === 'left') {
        this.setNodeSide(child, CONSTANTS.LAYOUT_GROW_DIR.LEFT)
      }
    }

    this.normalizeRootChildrenByDir(tree)
    this.updateNodeTree(tree)
  }

  getNodeListUids(nodes) {
    const list = Array.isArray(nodes) ? nodes : nodes ? [nodes] : []
    return list.map(node => this.getNodeUid(node)).filter(Boolean)
  }

  getNodeData(node) {
    return node?.data || node?._node?.data || node?.nodeData?.data || null
  }

  getNodeUid(node) {
    const data = this.getNodeData(node)
    return data?.uid || node?.getData?.('uid') || data?.text
  }

  getNodeSide(node) {
    const data = this.getNodeData(node)
    const dir = data?.dir || node?.getData?.('dir')
    if (dir === CONSTANTS.LAYOUT_GROW_DIR.RIGHT || dir === 'right') return CONSTANTS.LAYOUT_GROW_DIR.RIGHT
    if (dir === CONSTANTS.LAYOUT_GROW_DIR.LEFT || dir === 'left') return CONSTANTS.LAYOUT_GROW_DIR.LEFT
    return null
  }

  setNodeSide(node, side) {
    const data = this.getNodeData(node)
    if (data) data.dir = side
    if (node) node.dir = side
    if (node?._node) node._node.dir = side
  }

  syncRenderedRootChildDirections() {
    const tree = this.mindMap.renderer.renderTree
    if (!this.isMindMapLayout() || !tree?.children) return
    for (const child of tree.children) {
      const side = this.getNodeSide(child)
      if (side) this.setNodeSide(child, side)
    }
  }

  inferMovedSide(tree, movedUids, previousDirs) {
    if (!movedUids.size) return null
    const oldRightNumber = this._childrenSnapshot.filter(item => item.dir === CONSTANTS.LAYOUT_GROW_DIR.RIGHT || item.dir === 'right').length
    const firstMovedIndex = tree.children.findIndex(child => movedUids.has(this.getNodeUid(child)))
    if (firstMovedIndex < 0) return null
    const previousDir = previousDirs.get(this.getNodeUid(tree.children[firstMovedIndex]))
    if (firstMovedIndex < oldRightNumber) return CONSTANTS.LAYOUT_GROW_DIR.RIGHT
    if (previousDir) return previousDir
    return CONSTANTS.LAYOUT_GROW_DIR.LEFT
  }

  normalizeRootChildrenByDir(tree) {
    if (!tree?.children) return false
    const rightChildren = tree.children.filter(child => this.getNodeSide(child) === CONSTANTS.LAYOUT_GROW_DIR.RIGHT)
    const leftChildren = tree.children.filter(child => this.getNodeSide(child) === CONSTANTS.LAYOUT_GROW_DIR.LEFT)
    if (rightChildren.length + leftChildren.length !== tree.children.length) return false
    tree.children = [...rightChildren, ...leftChildren]
    tree.data.rightNumber = rightChildren.length
    return true
  }

  layoutChange(layout) {
    if (this._isDragging) return
    if (layout === CONSTANTS.LAYOUT.MIND_MAP) {
      this.updateRenderTree()
    }
  }

  updateRenderTree() {
    if (this._isDragging) return
    this.updateNodeTree(this.mindMap.renderer.renderTree)
    this.mindMap.render()
  }

  beforeSetData(data) {
    if (this._isDragging) return
    if (this.isMindMapLayout()) {
      this.updateNodeTree(data)
    }
  }

  beforeUpdateData(data) {
    if (this._isDragging) return
    if (this.isMindMapLayout()) {
      this.updateNodeTree(data)
    }
  }

  updateNodeTree(tree) {
    if (!this.isMindMapLayout() || !tree?.children) return
    const childrenLength = tree.children.length
    if (childrenLength <= 0) return
    if (this.normalizeRootChildrenByDir(tree)) return

    const rightNumber = this.getRightNumber(tree)
    const center = rightNumber != null
      ? Math.min(rightNumber, childrenLength)
      : getBalancedRightNumber(childrenLength)

    tree.children.forEach((item, index) => {
      const data = this.getNodeData(item)
      if (!data) return
      this.setNodeSide(item, index + 1 <= center
        ? CONSTANTS.LAYOUT_GROW_DIR.RIGHT
        : CONSTANTS.LAYOUT_GROW_DIR.LEFT)
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
