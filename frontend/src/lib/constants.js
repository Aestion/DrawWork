export const CANVAS_TYPES = {
  excalidraw: { label: '手绘', icon: 'pen', creatable: true },
  tencentmind: { label: '腾讯思维', icon: 'brain', creatable: true },
  kanban: { label: '看板', icon: 'kanban', creatable: true },
  swimlane: { label: '泳道图', icon: 'workflow', creatable: true },
  simplemindmap: { label: 'Mind-Map（已停用）', icon: 'network', creatable: false, disabled: true },
  mindmap: { label: '思维导图（已停用）', icon: 'mindmap', creatable: false, disabled: true },
  mindelixir: { label: '思维导图（已停用）', icon: 'mindmap', creatable: false, disabled: true }
}

export const PERMISSION_LABELS = {
  owner: '所有者',
  editor: '编辑者',
  commenter: '评论者',
  viewer: '查看者'
}
