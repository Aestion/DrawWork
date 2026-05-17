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

    const consumedKey = 'drawwork_consumed_tokens'
    const consumedTokens = JSON.parse(localStorage.getItem(consumedKey) || '[]')
    const alreadyConsumed = consumedTokens.includes(token)
    const consumeParam = alreadyConsumed ? 'false' : 'true'

    api.get(`/shares/validate?token=${encodeURIComponent(token)}&consume=${consumeParam}`)
      .then((res) => {
        const { board_id, board } = res.data
        if (!board_id) {
          setStatus('分享链接无效')
          return
        }

        // Mark token as consumed locally to prevent refresh from burning uses
        if (!alreadyConsumed) {
          consumedTokens.push(token)
          localStorage.setItem(consumedKey, JSON.stringify(consumedTokens))
        }

        // Store share info for later use (e.g., after login)
        localStorage.setItem('drawwork_share_board_id', board_id)
        localStorage.setItem('drawwork_share_token', token)

        if (authToken) {
          setStatus(`正在跳转到画板「${board?.name || ''}」...`)
          setTimeout(() => navigate(`/board/${board_id}`), 500)
        } else {
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
