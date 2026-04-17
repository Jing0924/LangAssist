import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }

type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-[linear-gradient(145deg,var(--surface-ink)_0%,var(--surface-mid)_42%,oklch(0.2_0.08_250)_100%)] p-8 text-center">
          <h1 className="m-0 text-xl font-semibold text-foreground">
            發生未預期錯誤
          </h1>
          <p className="m-0 max-w-xl break-words text-secondary">
            {this.state.error.message}
          </p>
          <button
            type="button"
            className="mt-2 cursor-pointer rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-5 py-2.5 font-inherit text-foreground hover:border-accent-soft hover:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            onClick={() => this.setState({ error: null })}
          >
            再試一次
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
