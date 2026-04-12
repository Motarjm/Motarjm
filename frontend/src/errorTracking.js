// Error Tracking Module for PostHog
// Centralized error capture with standardized schema that sends all errors to PostHog
// Provides specialized tracking functions: trackApiError(), trackFileError(), trackModelError(), trackNetworkError(), trackComponentError(), trackValidationError()
// Automatically extracts error message, code, and stack trace (first 5 lines) from Error objects or strings
// Captures browser/OS info, component name, user action, severity level, recovery status for each error
// All errors sent as 'error_occurred' event to PostHog with consistent properties for analysis and dashboards
// Logs errors to console in development mode (🚨 prefix) for easier debugging

import posthog from './posthogConfig';

const MAX_STACK_TRACE_LENGTH = 4000;
const MAX_TEXT_FIELD_LENGTH = 1000;

const truncateText = (value, maxLength = MAX_TEXT_FIELD_LENGTH) => {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const normalizeContext = (context = {}) => {
  const normalized = { ...context };

  if (normalized.response_data !== undefined) {
    normalized.response_data = truncateText(normalized.response_data, MAX_TEXT_FIELD_LENGTH);
  }

  if (normalized.response_preview !== undefined) {
    normalized.response_preview = truncateText(normalized.response_preview, MAX_TEXT_FIELD_LENGTH);
  }

  if (normalized.backend_detail !== undefined) {
    normalized.backend_detail = truncateText(normalized.backend_detail, MAX_TEXT_FIELD_LENGTH);
  }

  return normalized;
};

/**
 * Get browser and OS information
 */
const getBrowserInfo = () => {
  const ua = navigator.userAgent;
  let browser = 'Unknown';
  let os = 'Unknown';

  // Detect browser
  if (ua.indexOf('Firefox') > -1) browser = 'Firefox';
  else if (ua.indexOf('Chrome') > -1) browser = 'Chrome';
  else if (ua.indexOf('Safari') > -1) browser = 'Safari';
  else if (ua.indexOf('Edge') > -1) browser = 'Edge';
  else if (ua.indexOf('Opera') > -1 || ua.indexOf('OPR') > -1) browser = 'Opera';

  // Detect OS
  if (ua.indexOf('Windows') > -1) os = 'Windows';
  else if (ua.indexOf('Mac') > -1) os = 'macOS';
  else if (ua.indexOf('Linux') > -1) os = 'Linux';
  else if (ua.indexOf('Android') > -1) os = 'Android';
  else if (ua.indexOf('iOS') > -1) os = 'iOS';

  return { browser, os, user_agent: ua };
};

/**
 * Extract useful info from error object
 */
const extractErrorInfo = (error) => {
  let errorMessage = 'Unknown error';
  let errorCode = null;
  let stackTrace = null;
  let errorName = null;

  if (error) {
    // Handle string errors
    if (typeof error === 'string') {
      errorMessage = error;
    }
    // Handle Error objects
    else if (error instanceof Error) {
      errorMessage = error.message || error.toString();
      errorName = error.name || null;
      if (error.code) {
        errorCode = error.code;
      }
      if (error.stack) {
        stackTrace = truncateText(error.stack, MAX_STACK_TRACE_LENGTH);
      }
    }
    // Handle plain objects with message property
    else if (typeof error === 'object' && error.message) {
      errorMessage = error.message;
      if (error.name) {
        errorName = error.name;
      }
      if (error.code) {
        errorCode = error.code;
      }
      if (error.stack) {
        stackTrace = truncateText(error.stack, MAX_STACK_TRACE_LENGTH);
      }
    }
    // Handle other types
    else {
      errorMessage = String(error);
    }
  }

  return { errorMessage, errorCode, stackTrace, errorName };
};

/**
 * Main error tracking function
 * @param {Error|string} error - The error object or message
 * @param {Object} options - Additional options
 * @param {string} options.errorType - Type of error (api_error, file_error, validation_error, etc)
 * @param {string} options.component - React component name where error occurred
 * @param {string} options.function - Function name where error occurred
 * @param {string} options.action - User action being performed
 * @param {string} options.severity - Error severity (critical, high, medium, low)
 * @param {boolean} options.recoveryAttempted - Whether recovery was attempted
 * @param {boolean} options.recoverySuccess - Whether recovery succeeded
 * @param {Object} options.context - Additional context data
 */
export const trackError = (error, options = {}) => {
  try {
    const {
      errorType = 'unknown_error',
      component = 'unknown',
      function: functionName = 'unknown',
      action = 'unknown',
      severity = 'medium',
      recoveryAttempted = false,
      recoverySuccess = false,
      context = {},
    } = options;

    const { errorMessage, errorCode, stackTrace, errorName } = extractErrorInfo(error);
    const { browser, os, user_agent } = getBrowserInfo();
    const normalizedContext = normalizeContext(context);

    const errorEvent = {
      error_type: errorType,
      error_message: String(errorMessage) || 'Unknown error',
      error_name: errorName ? String(errorName) : null,
      error_code: errorCode ? String(errorCode) : null,
      severity: severity,
      component: component,
      function: functionName,
      action: action,
      stack_trace: stackTrace ? String(stackTrace) : null,
      recovery_attempted: recoveryAttempted,
      recovery_success: recoverySuccess,
      browser: browser,
      os: os,
      user_agent: user_agent,
      timestamp: new Date().toISOString(),
      ...normalizedContext,
    };

    // Log to console in development
    if (import.meta.env.DEV) {
      console.error('🚨 Error Tracked:', errorEvent);
    }

    // Send to PostHog
    posthog.capture(`${errorMessage}`, errorEvent);
  } catch (trackingError) {
    console.error('❌ Failed to track error:', trackingError);
  }
};

/**
 * Track API errors
 * @param {Error} error - The error object
 * @param {Object} options - API error options
 * @param {string} options.endpoint - API endpoint that failed
 * @param {number} options.statusCode - HTTP status code
 * @param {string} options.method - HTTP method (GET, POST, etc)
 * @param {string} options.action - What user was doing
 * @param {Object} options.context - Additional context
 */
export const trackApiError = (error, options = {}) => {
  const {
    endpoint = 'unknown',
    statusCode = null,
    statusText = null,
    method = 'unknown',
    action = 'unknown',
    context = {},
  } = options;

  // Determine severity based on status code
  let severity = 'high';
  if (statusCode >= 500) severity = 'critical';
  else if (statusCode === 429) severity = 'medium'; // Rate limited
  else if (statusCode >= 400) severity = 'medium';

  trackError(error, {
    errorType: 'api_error',
    component: 'APIService',
    action: action,
    severity: severity,
    context: {
      endpoint: endpoint,
      status_code: statusCode,
      status_text: statusText,
      http_method: method,
      ...context,
    },
  });
};

/**
 * Track file processing errors
 * @param {Error} error - The error object
 * @param {Object} options - File error options
 * @param {string} options.fileType - Type of file (pdf, xliff, etc)
 * @param {number} options.fileSize - Size of file in bytes
 * @param {string} options.fileName - Name of file
 * @param {string} options.operation - Operation being performed (parse, validate, convert)
 * @param {Object} options.context - Additional context
 */
export const trackFileError = (error, options = {}) => {
  const {
    fileType = 'unknown',
    fileSize = null,
    fileName = 'unknown',
    operation = 'unknown',
    context = {},
  } = options;

  trackError(error, {
    errorType: 'file_error',
    component: 'FileService',
    action: `File ${operation}: ${fileName}`,
    severity: 'high',
    context: {
      file_type: fileType,
      file_size: fileSize,
      file_size_kb: fileSize ? Math.round(fileSize / 1024) : null,
      file_name: fileName,
      operation: operation,
      ...context,
    },
  });
};

/**
 * Track AI/Model errors
 * @param {Error} error - The error object
 * @param {Object} options - Model error options
 * @param {string} options.model - Model name (gemini, grok, deepseek, etc)
 * @param {string} options.action - What the model was doing
 * @param {string} options.input - Input that caused error (truncated if too long)
 * @param {Object} options.context - Additional context
 */
export const trackModelError = (error, options = {}) => {
  const {
    model = 'unknown',
    action = 'unknown',
    input = null,
    context = {},
  } = options;

  // Truncate input if too long
  const truncatedInput = input && input.length > 500 ? input.substring(0, 500) + '...' : input;

  trackError(error, {
    errorType: 'model_error',
    component: 'AIService',
    action: `Model ${model}: ${action}`,
    severity: 'high',
    context: {
      model_name: model,
      model_action: action,
      input_length: input ? input.length : null,
      input_preview: truncatedInput,
      ...context,
    },
  });
};

/**
 * Track validation errors
 * @param {string} errorMessage - Validation error message
 * @param {Object} options - Validation error options
 * @param {string} options.validationType - Type of validation (form, file, data)
 * @param {string} options.field - Field that failed validation
 * @param {Object} options.context - Additional context
 */
export const trackValidationError = (errorMessage, options = {}) => {
  const {
    validationType = 'unknown',
    field = 'unknown',
    context = {},
  } = options;

  trackError(new Error(errorMessage), {
    errorType: 'validation_error',
    component: 'Validator',
    severity: 'low',
    context: {
      validation_type: validationType,
      field_name: field,
      ...context,
    },
  });
};

/**
 * Track React component errors
 * @param {Error} error - The error object
 * @param {string} component - Component name
 * @param {string} info - React error boundary info
 */
export const trackComponentError = (error, component = 'unknown', info = '') => {
  trackError(error, {
    errorType: 'component_error',
    component: component,
    severity: 'high',
    context: {
      react_error_info: info,
    },
  });
};

/**
 * Track network/connectivity errors
 * @param {Error} error - The error object
 * @param {Object} options - Network error options
 * @param {string} options.errorType - Type of network error (timeout, offline, cors)
 * @param {string} options.endpoint - Endpoint that failed
 * @param {number} options.timeout - Timeout value in ms
 */
export const trackNetworkError = (error, options = {}) => {
  const {
    errorType: networkErrorType = 'unknown',
    endpoint = 'unknown',
    timeout = null,
    context = {},
  } = options;

  trackError(error, {
    errorType: 'network_error',
    component: 'NetworkService',
    severity: 'high',
    context: {
      network_error_type: networkErrorType,
      endpoint: endpoint,
      timeout_ms: timeout,
      ...context,
    },
  });
};

/**
 * Report an error with automatic recovery tracking
 * @param {Error} error - The error object
 * @param {Function} recoveryFn - Function to attempt recovery
 * @param {Object} options - Error options
 */
export const trackErrorWithRecovery = async (error, recoveryFn, options = {}) => {
  let recoverySuccess = false;
  
  try {
    if (recoveryFn && typeof recoveryFn === 'function') {
      await recoveryFn();
      recoverySuccess = true;
    }
  } catch (recoveryError) {
    console.error('Recovery attempt failed:', recoveryError);
  }

  trackError(error, {
    ...options,
    recoveryAttempted: true,
    recoverySuccess: recoverySuccess,
  });

  return recoverySuccess;
};

export default {
  trackError,
  trackApiError,
  trackFileError,
  trackModelError,
  trackValidationError,
  trackComponentError,
  trackNetworkError,
  trackErrorWithRecovery,
};
