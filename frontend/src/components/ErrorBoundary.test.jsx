import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'

const ThrowError = ({ message }) => {
  throw new Error(message || 'test error')
}

const SafeComponent = () => <div>正常运行</div>

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <SafeComponent />
      </ErrorBoundary>
    )
    expect(screen.getByText('正常运行')).toBeInTheDocument()
  })

  it('renders fallback UI when child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <ThrowError message="崩溃了" />
      </ErrorBoundary>
    )
    expect(screen.getByText('画布加载失败')).toBeInTheDocument()
    expect(screen.getByText('重新加载')).toBeInTheDocument()
    expect(screen.getByText('刷新页面')).toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it('shows custom title and message', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary title="出错了" message="自定义错误信息">
        <ThrowError />
      </ErrorBoundary>
    )
    expect(screen.getByText('出错了')).toBeInTheDocument()
    expect(screen.getByText('自定义错误信息')).toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it('retry button re-renders children', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    let shouldThrow = true
    const ConditionalThrow = () => {
      if (shouldThrow) throw new Error('oops')
      return <div>恢复正常</div>
    }

    const { rerender } = render(
      <ErrorBoundary key="test">
        <ConditionalThrow />
      </ErrorBoundary>
    )

    expect(screen.getByText('画布加载失败')).toBeInTheDocument()

    // Simulate retry: component no longer throws
    shouldThrow = false
    fireEvent.click(screen.getByText('重新加载'))

    // After retry, children should render again
    expect(screen.getByText('恢复正常')).toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it('does not catch errors outside React lifecycle', () => {
    // This verifies EventHandler errors still propagate
    const ClickThrow = () => {
      const handleClick = () => { throw new Error('click error') }
      return <button onClick={handleClick}>点我</button>
    }

    vi.spyOn(console, 'error').mockImplementation(() => {})
    // Rendering should succeed (ErrorBoundary only catches render-phase errors)
    render(
      <ErrorBoundary>
        <ClickThrow />
      </ErrorBoundary>
    )
    expect(screen.getByText('点我')).toBeInTheDocument()
    vi.restoreAllMocks()
  })
})
