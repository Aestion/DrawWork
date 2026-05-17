export default function SyncIndicator({
  connected = false,
  synced = false,
  label = 'disconnected',
  onlineCount = 1,
}) {
  const status = !connected
    ? { dot: 'bg-red-500', text: '离线', label: '离线' }
    : synced
      ? { dot: 'bg-green-500', text: '已同步', label: 'synced' }
      : { dot: 'bg-blue-500 animate-pulse', text: '同步中', label: 'syncing' }

  return (
    <span className="inline-flex items-center space-x-1.5 text-sm text-gray-500" title={`状态: ${status.text}`}>
      <span className={`inline-block h-2 w-2 rounded-full ${status.dot}`} />
      <span>{status.text}</span>
      {connected && (
        <span className="text-gray-400 ml-1">{onlineCount} 人在线</span>
      )}
    </span>
  )
}
