import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught React error:", error, info.componentStack);
  }

  handleReload() {
    window.location.href = "/";
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[hsl(222,47%,6%)] text-white px-6 text-center gap-6">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center border border-red-500/40">
            <span className="text-3xl">⚠️</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2">Algo salió mal</h1>
            <p className="text-white/60 text-sm max-w-sm">
              Ocurrió un error inesperado en la aplicación. Por favor regresa al inicio e intenta de nuevo.
            </p>
            {this.state.error && (
              <p className="mt-3 text-xs text-red-400/80 font-mono bg-red-500/10 px-3 py-2 rounded-lg max-w-md mx-auto break-all">
                {this.state.error.message}
              </p>
            )}
          </div>
          <button
            onClick={this.handleReload}
            className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors"
          >
            Volver al inicio
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
