import { CONSTANTS } from 'simple-mind-map/src/constants/constant'

/**
 * UnbalancedLayoutPlugin
 *
 * 实现 Tencent Docs 风格的"不平衡结构"布局。
 * 根据 rootTopic.extensions['structureClass.unbalanced']['right-number']
 * 将一级子节点分配到左右两侧：
 * - 前 right-number 个 → 右侧
 * - 剩余节点 → 左侧
 *
 * 用户可通过拖拽调整节点顺序来控制哪些节点在左/右。
 * 拖拽跨侧移动节点时，right-number 会自动更新。
 */
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

    // Wrap execCommand to emit 'beforeExecCommand' event
    const mindMap = this.mindMap
    const origExec = mindMap.execCommand.bind(mindMap)
    mindMap.execCommand = function (name, ...args) {
      mindMap.emit('beforeExecCommand', name)
      return origExec(name, ...args)
    }

    this.mindMap.on('beforeExecCommand', this.beforeExecCommand)
    this.mindMap.on('layout_change', this.layoutChange)
    this.mindMap.on('afterExecCommand', this.afterExecCommand)
    this.mindMap.on('before_update_data', this.beforeUpdateData)
    this.mindMap.on('before_set_data', this.beforeSetData)

    // 跟踪拖拽状态
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

  /** 从根节点数据中读取 right-number 配置 */
  getRightNumber(tree) {
    return tree?.data?.rightNumber
  }

  /** 跟踪拖拽状态 */
  onDragStart() {
    this._isDragging = true
  }

  onDragEnd() {
    this._isDragging = false
  }

  /** 命令执行前快照子节点状态，用于检测拖拽方向 */
  beforeExecCommand(name) {
    if (name === 'MOVE_NODE_TO' || name === 'INSERT_AFTER' || name === 'INSERT_BEFORE') {
      const tree = this.mindMap.renderer.renderTree
      this._childrenSnapshot = tree?.children?.map(c => ({
        uid: c.data.uid || c.data.text,
        dir: c.data.dir
      })) || []
    }
  }

  /** 监听命令执行后重新分配 */
  afterExecCommand(name) {
    if (!this.isMindMapLayout()) return
    if (this._isDragging) {
      if (name === 'MOVE_NODE_TO' || name === 'INSERT_AFTER' || name === 'INSERT_BEFORE') {
        this.handleNodeMoved()
      }
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

  /** 处理节点移动（拖拽或重新排序）：检测方向，更新 rightNumber */
  handleNodeMoved() {
    const tree = this.mindMap.renderer.renderTree
    if (!tree?.children || !this._childrenSnapshot?.length) return

    const oldRightNumber = this.getRightNumber(tree) || Math.ceil(tree.children.length / 2)
    const oldOrder = this._childrenSnapshot.map(s => s.uid)
    const newOrder = tree.children.map(c => c.data.uid || c.data.text)

    // 找到第一个不匹配的位置，确定被拖拽的节点
    for (let i = 0; i < oldOrder.length; i++) {
      if (oldOrder[i] !== newOrder[i]) {
        const oldNode = oldOrder[i]
        const newNode = newOrder[i]
        const oldNodeNewIndex = newOrder.indexOf(oldNode)
        const newNodeOldIndex = oldOrder.indexOf(newNode)

        // 判断哪个节点是被拖拽的
        let draggedOldIndex, draggedNewIndex
        if (oldNodeNewIndex >= newNodeOldIndex) {
          // 向前拖拽或相邻拖拽：oldOrder[i] 是被拖拽节点
          draggedOldIndex = i
          draggedNewIndex = oldNodeNewIndex
        } else {
          // 向后拖拽：newOrder[i] 是被拖拽节点
          draggedOldIndex = newNodeOldIndex
          draggedNewIndex = i
        }

        // 判断是否跨越了 rightNumber 边界
        if (draggedOldIndex < oldRightNumber && draggedNewIndex >= oldRightNumber) {
          // 从右跨到左 → rightNumber 减 1
          tree.data.rightNumber = Math.max(1, oldRightNumber - 1)
        } else if (draggedOldIndex >= oldRightNumber && draggedNewIndex < oldRightNumber) {
          // 从左跨到右 → rightNumber 加 1
          tree.data.rightNumber = Math.min(tree.children.length - 1, oldRightNumber + 1)
        }
        // 同侧内排序 → rightNumber 不变

        break
      }
    }

    // 用更新后的 rightNumber 重新分配 dir
    this.updateNodeTree(tree)
  }

  /** 切换布局时重新分配 */
  layoutChange(layout) {
    if (layout === CONSTANTS.LAYOUT.MIND_MAP) {
      this.updateRenderTree()
    }
  }

  /** 更新当前的渲染树 */
  updateRenderTree() {
    this.updateNodeTree(this.mindMap.renderer.renderTree)
    // 强制重绘，让布局引擎重新读取 dir 值
    this.mindMap.render()
  }

  /** 更新前处理数据 */
  beforeSetData(data) {
    if (this.isMindMapLayout()) {
      this.updateNodeTree(data)
    }
  }

  /** 更新前处理数据 */
  beforeUpdateData(data) {
    if (this.isMindMapLayout()) {
      this.updateNodeTree(data)
    }
  }

  /**
   * 根据 right-number 分配一级节点方向。
   * 数据转换阶段已设好初始 dir，此方法确保每次变更后保持正确。
   */
  updateNodeTree(tree) {
    if (!this.isMindMapLayout()) return
    const root = tree
    const childrenLength = root.children.length
    if (childrenLength <= 0) return

    const rightNumber = this.getRightNumber(tree)
    const center = rightNumber != null
      ? Math.min(rightNumber, childrenLength)
      : Math.ceil(childrenLength / 2)

    root.children.forEach((item, index) => {
      if (index + 1 <= center) {
        item.data.dir = CONSTANTS.LAYOUT_GROW_DIR.RIGHT
      } else {
        item.data.dir = CONSTANTS.LAYOUT_GROW_DIR.LEFT
      }
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
