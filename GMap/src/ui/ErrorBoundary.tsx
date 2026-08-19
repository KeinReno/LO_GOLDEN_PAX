import React, { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    } else {
      console.error("Uncaught error:", error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="error-boundary" style={{ padding: 20, color: "red", background: "#fee" }}>
          <h2>Что-то пошло не так.</h2>
          <details style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 10 }}>
            {this.state.error?.toString()}
          </details>
          <button
            type="button"
            className="btn primary"
            style={{ marginTop: 12 }}
            onClick={() => window.location.reload()}
          >
            Перезагрузить
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
