import { Component, type ReactNode } from 'react';

/** If rendering ever fails (say, on an unexpected message), offer a reload instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Triface crashed', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="setup">
        <h1>Something went wrong</h1>
        <p className="muted">Reloading usually fixes it. Online games pick up where they left off.</p>
        <button onClick={() => location.reload()}>Reload</button>
      </main>
    );
  }
}
