import React from "react";

interface SectionBoundaryProps {
  children: React.ReactNode;
}

interface SectionBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Per-section error boundary: if the wizard or result view throws, the studio
 * stays usable (header, saved collection, navigation all keep working) and
 * the affected section offers a retry instead of blanking the page.
 */
export class SectionBoundary extends React.Component<
  SectionBoundaryProps,
  SectionBoundaryState
> {
  state: SectionBoundaryState = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): SectionBoundaryState {
    return {
      hasError: true,
      message: error.message || "Something went wrong in this section.",
    };
  }

  componentDidCatch(error: Error) {
    console.error("[studio section] caught:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="clay-card p-6 sm:p-8">
          <h3 className="clay-title text-lg">This section hit a snag</h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            {this.state.message} Your saved resumes and profile are untouched.
          </p>
          <button
            type="button"
            className="clay-button mt-4 inline-flex h-11 items-center px-6 text-sm font-semibold"
            onClick={() => this.setState({ hasError: false, message: "" })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
