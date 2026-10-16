import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-err/15 text-err-ink flex items-center justify-center mb-3.5">
            <span className="material-symbols-rounded text-[28px]">error</span>
          </div>
          <h2 className="text-body-lg font-bold text-ink mb-1.5">Something went wrong</h2>
          <p className="text-body-sm text-ink-sub max-w-sm mb-5">
            An error occurred while displaying this section. You can reload the page or return to the home screen.
          </p>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="h-10 px-4 rounded-xl bg-header-ink text-white font-semibold text-body-sm shadow-xs hover:opacity-90 active:opacity-80 transition-opacity"
            >
              Reload page
            </button>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false });
                window.location.href = '/';
              }}
              className="h-10 px-4 rounded-xl border border-line bg-surface text-ink font-semibold text-body-sm hover:bg-soft transition-colors"
            >
              Home
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
