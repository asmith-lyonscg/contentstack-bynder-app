import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Bynder Image Settings error", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-failed">
          <h3>Something went wrong</h3>
          <p>Reload the entry. If the problem continues, check the browser console.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
