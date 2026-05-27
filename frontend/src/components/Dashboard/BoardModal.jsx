import { useState } from 'react'
import api from '../../lib/axios'

export default function BoardModal({ board, onClose, onCreate, onUpdate }) {
  const isEdit = Boolean(board)
  const [name, setName] = useState(board?.name || '')
  const [description, setDescription] = useState(board?.description || '')
  const [coverUrl, setCoverUrl] = useState(board?.cover_url || '')
  const [isPublic, setIsPublic] = useState(Boolean(board?.is_public))
  const [isUploadingCover, setIsUploadingCover] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !isEdit) return

    if (!file.type.startsWith('image/')) {
      setUploadError('请选择图片文件')
      return
    }

    setIsUploadingCover(true)
    setUploadError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await api.post(`/upload?board_id=${board.id}`, formData)
      setCoverUrl(res.data.url || `/api/upload/${res.data.id}`)
    } catch (err) {
      setUploadError(err.response?.data?.error || '封面上传失败')
    } finally {
      setIsUploadingCover(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      cover_url: coverUrl.trim() || null,
      is_public: isPublic
    }

    if (isEdit) {
      await onUpdate(board.id, payload)
    } else {
      await onCreate(payload)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold mb-4">{isEdit ? '编辑画板' : '新建画板'}</h3>
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

          <div>
            <label htmlFor="board-cover" className="block text-sm font-medium text-gray-700 mb-1">图示/封面 URL</label>
            <input
              id="board-cover"
              name="boardCover"
              type="text"
              value={coverUrl}
              onChange={e => setCoverUrl(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://example.com/cover.png"
            />
            {isEdit && (
              <div className="mt-2 flex items-center gap-3">
                <label className="inline-flex cursor-pointer items-center rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    aria-label="上传封面图"
                    onChange={handleCoverUpload}
                    disabled={isUploadingCover}
                  />
                  {isUploadingCover ? '上传中...' : '上传封面图'}
                </label>
                {coverUrl && (
                  <img src={coverUrl} alt="" className="h-12 w-16 rounded border border-gray-200 object-cover" />
                )}
              </div>
            )}
            {uploadError && <p className="mt-1 text-xs text-red-500">{uploadError}</p>}
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
              disabled={!name.trim() || isUploadingCover}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isEdit ? '保存' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
