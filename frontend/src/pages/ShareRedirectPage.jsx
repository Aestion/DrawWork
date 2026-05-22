import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../lib/axios'
import { useAuthStore } from '../stores/authStore'

export default function ShareRedirectPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { token: authToken } = useAuthStore()
  const [status, setStatus] = useState('验证分享链接中...')

  useEffect(() => {
    if (!token || token === 'undefined') {
      setStatus('无效的分享链接')
      return
    }

    // Always store the share token so AuthPage can redirect back after login
    localStorage.setItem('drawwork_share_token', token)

    api.get(`/shares/validate?token=${encodeURIComponent(token)}`)
      .then((res) => {
        const { board_id, board } = res.data
        if (!board_id) {
          setStatus('分享链接无效')
          return
        }

        localStorage.setItem('drawwork_share_board_id', board_id)

        if (authToken) {
          // Logged in — BoardShare was created by the backend, go to the board
          setStatus(`正在跳转到画板「${board?.name || ''}」...`)
          setTimeout(() => navigate(`/board/${board_id}`), 500)
        } else {
          // Not logged in — token is stored, AuthPage will redirect back here after login
          setStatus('请先登录以访问该画板')
          setTimeout(() => navigate('/login'), 1500)
        }
      })
      .catch((err) => {
        const msg = err.response?.data?.error || '分享链接验证失败'
        setStatus(msg)
      })
  }, [token, authToken, navigate])

  return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="text-lg text-gray-700 mb-2">{status}</div>
      </div>
    </div>
  )
}
