export function KanbanSkeleton() {
  return (
    <div className="flex-1 overflow-auto p-4 bg-gray-50">
      <div className="flex space-x-4 min-w-max">
        {[1, 2, 3].map(i => (
          <div key={i} className="w-64 bg-gray-100 rounded-lg p-3 flex-shrink-0 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
            <div className="space-y-2">
              <div className="h-12 bg-gray-200 rounded" />
              <div className="h-12 bg-gray-200 rounded" />
              <div className="h-12 bg-gray-200 rounded w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SwimlaneSkeleton() {
  return (
    <div className="flex-1 overflow-auto p-4 bg-white animate-pulse">
      <div className="space-y-4">
        {[1, 2].map(i => (
          <div key={i} className="h-20 bg-gray-100 rounded-lg border-2 border-gray-200">
            <div className="flex items-center h-full px-4">
              <div className="h-4 bg-gray-200 rounded w-20 mr-4" />
              <div className="flex gap-3">
                <div className="h-10 w-24 bg-gray-200 rounded" />
                <div className="h-10 w-24 bg-gray-200 rounded" />
                <div className="h-10 w-20 bg-gray-200 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function VoteSkeleton() {
  return (
    <div className="p-3 space-y-3 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-gray-50 rounded-lg p-3 border">
          <div className="h-4 bg-gray-200 rounded w-32 mb-3" />
          <div className="space-y-2">
            <div className="h-8 bg-gray-100 rounded" />
            <div className="h-8 bg-gray-100 rounded" />
            <div className="h-8 bg-gray-100 rounded w-3/4" />
          </div>
          <div className="h-3 bg-gray-200 rounded w-20 mt-2" />
        </div>
      ))}
    </div>
  )
}
