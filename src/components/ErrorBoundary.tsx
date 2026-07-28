import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { PAWTXLogo } from './PAWTXLogo';

interface ErrorBoundaryProps {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Uncaught error caught by Peace Academy ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-parchment text-graphite flex flex-col items-center justify-center p-6 sm:p-12 selection:bg-terracotta selection:text-white">
          <div className="max-w-xl w-full bg-white rounded-[28px] border border-warm-taupe p-8 sm:p-10 shadow-lg space-y-6 text-center">
            
            {/* Header Brand Logo */}
            <div className="flex justify-center">
              <PAWTXLogo className="w-16 h-16" showText={true} textColor="text-graphite" />
            </div>

            {/* Error Badge */}
            <div className="inline-flex items-center gap-2 bg-terracotta/10 text-terracotta px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest border border-terracotta/20 mx-auto">
              <AlertTriangle className="w-4 h-4 text-terracotta" />
              <span>System Notice</span>
            </div>

            {/* Title & Description */}
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-graphite">
                Something Went Unexpectedly Wrong
              </h1>
              <p className="text-sm text-charcoal leading-relaxed">
                An unforeseen issue occurred while rendering this section. Our system logged the error details to help us fix it. You can attempt to reload or reset the view below.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="w-full sm:w-auto px-6 py-3 rounded-full bg-terracotta hover:bg-terracotta-deep text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Page
              </button>
              <button
                onClick={this.handleReset}
                className="w-full sm:w-auto px-6 py-3 rounded-full bg-aged-paper hover:bg-warm-taupe text-graphite font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 border border-warm-taupe cursor-pointer"
              >
                <Home className="w-4 h-4 text-olive" />
                Try Recovery
              </button>
            </div>

            {/* Error Technical Details Accordion */}
            {this.state.error && (
              <details className="text-left bg-aged-paper p-4 rounded-2xl border border-warm-taupe text-xs font-mono text-charcoal overflow-x-auto space-y-1">
                <summary className="font-sans font-bold cursor-pointer text-graphite hover:text-terracotta pawtx-focus">
                  View Diagnostic Error Details
                </summary>
                <p className="pt-2 text-red-700 font-semibold">{this.state.error.toString()}</p>
                {this.state.errorInfo && (
                  <pre className="whitespace-pre-wrap text-[11px] pt-1 text-stone-600 leading-tight">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </details>
            )}

          </div>

          <p className="mt-8 text-xs text-charcoal text-center">
            Peace Academy of West Texas &bull; 3411 Brentwood Dr, Odessa, TX 79762 &bull; paowtx@gmail.com
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
