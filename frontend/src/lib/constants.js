export const CANVAS_TYPES = {
  excalidraw: { label: '手绘', icon: 'pen', creatable: true },
  tencentmind: { label: '思维导图', icon: 'brain', creatable: true },
  kanban: { label: '看板', icon: 'kanban', creatable: true },
  swimlane: { label: '泳道图', icon: 'workflow', creatable: true },
  simplemindmap: { label: '旧版思维导图', icon: 'network', creatable: false, disabled: true },
  mindmap: { label: '旧版思维导图', icon: 'mindmap', creatable: false, disabled: true },
  mindelixir: { label: '旧版思维导图', icon: 'mindmap', creatable: false, disabled: true }
}

export const PERMISSION_LABELS = {
  owner: '所有者',
  editor: '编辑者',
  commenter: '评论者',
  viewer: '查看者'
}
