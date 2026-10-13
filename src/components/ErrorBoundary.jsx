import React from 'react';

export default class ErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) { console.error('Application error', error, info); }
  render() {
    if (this.state.hasError) return (
      <div role="alert" className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-slate-700">
        <h1>無法顯示頁面 / Unable to display this page</h1>
        <p>請重新載入後再試一次。 / Please reload and try again.</p>
        <button className="bg-sky-600 text-white rounded-lg px-4 py-2" onClick={() => window.location.reload()}>重新載入 / Reload</button>
      </div>
    );
    return this.props.children;
  }
}
