import { useState } from 'react'

export default function BoardModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    onCreate({ name: name.trim(), description, is_public: isPublic })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold mb-4">新建画板</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="board-name" className="block text-sm font-medium text-gray-700 mb-1">名称 *</label>
            <input
              id="board-name"
              name="boardName"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="输入画板名称"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="board-description" className="block text-sm font-medium text-gray-700 mb-1">描述</label>
            <textarea
              id="board-description"
              name="boardDescription"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              placeholder="可选描述"
            />
          </div>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="public"
              checked={isPublic}
              onChange={e => setIsPublic(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="public" className="text-sm text-gray-700">对内网所有人可见</label>
          </div>
          <div className="flex justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              创建
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
