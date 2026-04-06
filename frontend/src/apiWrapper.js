 // API Wrapper with Automatic Error Tracking
// Wraps all fetch/axios calls with error handling and PostHog tracking
// Provides convenience methods: apiGet(), apiPost(), apiPut(), apiDelete(), apiUploadFile()
// Automatically catches HTTP errors (4xx, 5xx), network errors (timeout, connection), and validates responses
// Calls trackApiError() or trackNetworkError() on failure with endpoint, method, status code, and context
// Includes 30-second default timeout with configurable options and file upload progress tracking
// No need to manually add error tracking - errors are captured automatically for all API calls

import { API_URL } from './apiConfig';
import { trackApiError, trackNetworkError } from './errorTracking';

const REQUEST_TIMEOUT = 30000; // 30 seconds

/**
 * Timeout wrapper for fetch requests
 */
const fetchWithTimeout = (url, options = {}, timeout = REQUEST_TIMEOUT) => {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('Request timeout')),
        timeout
      )
    ),
  ]);
};

/**
 * Make an API request with error tracking
 * @param {string} endpoint - API endpoint path
 * @param {Object} options - Fetch options
 * @param {string} options.method - HTTP method (GET, POST, etc)
 * @param {Object} options.body - Request body
 * @param {Object} options.headers - Custom headers
 * @param {number} options.timeout - Timeout in ms
 * @param {string} options.userAction - What the user is doing
 * @param {Object} options.context - Additional context for error tracking
 */
export const apiCall = async (endpoint, options = {}) => {
  const {
    method = 'GET',
    body = null,
    headers = {},
    timeout = REQUEST_TIMEOUT,
    userAction = 'Making API request',
    context = {},
  } = options;

  const url = `${API_URL}${endpoint}`;
  const defaultHeaders = {
    'Content-Type': 'application/json',
    ...headers,
  };

  const fetchOptions = {
    method,
    headers: defaultHeaders,
  };

  if (body) {
    fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  try {
    const response = await fetchWithTimeout(url, fetchOptions, timeout);

    // Handle non-2xx responses
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(
        errorData.message || errorData.detail || `HTTP ${response.status}`
      );
      error.code = errorData.code || `HTTP_${response.status}`;

      trackApiError(error, {
        endpoint: endpoint,
        method: method,
        statusCode: response.status,
        action: userAction,
        context: {
          response_data: JSON.stringify(errorData).substring(0, 500),
          ...context,
        },
      });

      throw error;
    }

    // Parse successful response
    const data = await response.json();
    return data;
  } catch (error) {
    // Distinguish between different types of errors
    let networkErrorType = 'unknown';

    if (error.message === 'Request timeout') {
      networkErrorType = 'timeout';
      trackNetworkError(error, {
        errorType: networkErrorType,
        endpoint: endpoint,
        timeout: timeout,
        context,
      });
    } else if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      networkErrorType = 'connection_error';
      trackNetworkError(error, {
        errorType: networkErrorType,
        endpoint: endpoint,
        context,
      });
    } else if (error.code?.startsWith('HTTP_')) {
      // Already tracked in the non-ok response handler
      throw error;
    } else {
      trackApiError(error, {
        endpoint: endpoint,
        method: method,
        action: userAction,
        context,
      });
    }

    throw error;
  }
};

/**
 * GET request
 */
export const apiGet = (endpoint, options = {}) => {
  return apiCall(endpoint, { ...options, method: 'GET' });
};

/**
 * POST request
 */
export const apiPost = (endpoint, body, options = {}) => {
  return apiCall(endpoint, { ...options, method: 'POST', body });
};

/**
 * PUT request
 */
export const apiPut = (endpoint, body, options = {}) => {
  return apiCall(endpoint, { ...options, method: 'PUT', body });
};

/**
 * DELETE request
 */
export const apiDelete = (endpoint, options = {}) => {
  return apiCall(endpoint, { ...options, method: 'DELETE' });
};

/**
 * Upload file with progress tracking and error handling
 * @param {string} endpoint - API endpoint for upload
 * @param {File} file - File to upload
 * @param {Object} options - Additional options
 * @param {Function} options.onProgress - Progress callback
 * @param {string} options.userAction - What the user is doing
 * @param {Object} options.context - Additional context
 */
export const apiUploadFile = async (endpoint, file, options = {}) => {
  const {
    onProgress = null,
    userAction = 'Uploading file',
    context = {},
  } = options;

  const formData = new FormData();
  formData.append('file', file);

  try {
    return await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            onProgress(percentComplete);
          }
        });
      }

      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch {
            reject(new Error('Invalid response format'));
          }
        } else {
          const error = new Error(`Upload failed with status ${xhr.status}`);
          error.code = `HTTP_${xhr.status}`;

          trackApiError(error, {
            endpoint: endpoint,
            method: 'POST',
            statusCode: xhr.status,
            action: userAction,
            context: {
              file_name: file.name,
              file_size: file.size,
              file_type: file.type,
              ...context,
            },
          });

          reject(error);
        }
      });

      // Handle errors
      xhr.addEventListener('error', () => {
        const error = new Error('Network error during upload');
        trackNetworkError(error, {
          errorType: 'upload_error',
          endpoint: endpoint,
          context: {
            file_name: file.name,
            file_size: file.size,
            ...context,
          },
        });
        reject(error);
      });

      // Handle timeout
      xhr.addEventListener('timeout', () => {
        const error = new Error('Upload timeout');
        trackNetworkError(error, {
          errorType: 'timeout',
          endpoint: endpoint,
          context: {
            file_name: file.name,
            ...context,
          },
        });
        reject(error);
      });

      xhr.timeout = options.timeout || REQUEST_TIMEOUT;
      xhr.open('POST', `${API_URL}${endpoint}`);
      xhr.send(formData);
    });
  } catch (error) {
    throw error;
  }
};

export default {
  apiCall,
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  apiUploadFile,
};
