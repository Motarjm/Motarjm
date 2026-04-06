// Error Boundary Component for React Error Handling
// Catches unhandled React component rendering errors that would crash the app
// Automatically tracks caught errors to PostHog with error details and component info
// Wraps around components to create isolated error zones (if one component fails, others still work)
// Renders children silently without showing any error UI to users
// Used in App.jsx to wrap Torgman, EditingInterface, and CompareInterface components
// Example: <ErrorBoundary name="MyComponent"><MyComponent /></ErrorBoundary>

import React from 'react';
import { trackComponentError } from '../errorTracking';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details
    this.setState({
      error: error,
      errorInfo: errorInfo,
    });

    // Track error with PostHog
    trackComponentError(
      error,
      this.props.name || 'UnknownComponent',
      errorInfo.componentStack
    );

    // Also log to console for development
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    // Error is tracked but nothing is displayed to user
    // Component continues to render children normally
    return this.props.children;
  }
}

export default ErrorBoundary;
