import { Component, type ErrorInfo, type ReactNode } from 'react'
import i18n from './i18n'

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
        <div className="error-boundary">
          <h1 className="error-boundary__title">
            {i18n.t('errorBoundary.title')}
          </h1>
          <p className="error-boundary__msg">{this.state.error.message}</p>
          <button
            type="button"
            className="error-boundary__retry"
            onClick={() => this.setState({ error: null })}
          >
            {i18n.t('errorBoundary.retry')}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
