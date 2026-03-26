// PostHog Analytics Events Helper
// Centralized place to track all analytics events

import posthog from './posthogConfig';

/**
 * Track file selection event
 * @param {string} fileType - 'pdf' or 'xliff'
 * @param {number} fileSize - Size of file in bytes
 */
export const trackFileSelected = (fileType, fileSize) => {
  posthog.capture('file_selected', {
    file_type: fileType,
    file_size: fileSize,
    file_size_kb: Math.round(fileSize / 1024),
    timestamp: new Date().toISOString(),
  });
};

/**
 * Track translation start event
 * @param {string} fileType - 'pdf' or 'xliff'
 * @param {number} fileSize - Size of file in bytes
 * @param {string} sourceLang - Source language code
 * @param {string} targetLang - Target language code
 */
export const trackTranslationStarted = (fileType, fileSize, sourceLang, targetLang) => {
  const isRealDocument = fileSize > 50000; // > 50KB heuristic
  
  posthog.capture('translation_started', {
    file_type: fileType,
    file_size: fileSize,
    file_size_kb: Math.round(fileSize / 1024),
    source_lang: sourceLang,
    target_lang: targetLang,
    is_real_document: isRealDocument,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Track translation completion event
 * @param {string} fileType - 'pdf' or 'xliff'
 * @param {number} fileSize - Size of file in bytes
 * @param {number} durationMs - Time taken in milliseconds
 * @param {boolean} success - Whether translation was successful
 */
export const trackTranslationCompleted = (fileType, fileSize, durationMs, success = true) => {
  const isRealDocument = fileSize > 50000;
  
  posthog.capture('translation_completed', {
    file_type: fileType,
    file_size: fileSize,
    file_size_kb: Math.round(fileSize / 1024),
    duration_minutes: Math.round(durationMs / 1000 / 60),
    is_real_document: isRealDocument,
    success: success,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Track document download event
 * @param {string} fileType - Type of file downloaded
 */
export const trackDocumentDownloaded = (fileType = 'pdf') => {
  posthog.capture('document_downloaded', {
    file_type: fileType,
    is_real_document: true, // If they downloaded, it was real work
    timestamp: new Date().toISOString(),
  });
};

/**
 * Track navigation between major sections
 * @param {string} section - Section name ('editing', 'compare', 'home', etc)
 * @param {string} source - Where they came from (optional)
 */
export const trackNavigation = (section, source = 'direct') => {
  posthog.capture(`navigation_${section}`, {
    source: source,
    destination: section,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Track session start
 * @param {string} entryPoint - URL path or section where session started
 */
export const trackSessionStarted = (entryPoint = '/') => {
  posthog.capture('session_started', {
    entry_point: entryPoint,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Track session end / focus panel session
 * @param {number} durationMs - Time spent in focus panel
 * @param {number} segmentId - Segment ID being edited
 * @param {number} messagesSent - Number of chat messages sent
 * @param {boolean} hadPendingEdits - Whether there were pending edits
 */
export const trackFocusPanelSession = (durationMs, segmentId, messagesSent = 0, hadPendingEdits = false) => {
  posthog.capture('focus_panel_session', {
    duration_ms: durationMs,
    duration_minutes: Math.round(durationMs / 1000 / 60),
    segment_id: segmentId,
    messages_sent: messagesSent,
    had_pending_edits: hadPendingEdits,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Track editing interface session
 * @param {number} durationMs - Time spent in editing interface
 * @param {boolean} pagesEdited - Whether any pages were edited
 */
export const trackEditingInterfaceSession = (durationMs, pagesEdited = false) => {
  posthog.capture('editing_interface_session', {
    duration_ms: durationMs,
    duration_minutes: Math.round(durationMs / 1000 / 60),
    pages_edited: pagesEdited,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Track AI suggestion applied
 * @param {string} modelUsed - AI model name ('gemini', 'grok', 'deepseek')
 * @param {number} suggestionLength - Length of suggestion text
 * @param {boolean} isArabic - Whether suggestion contains Arabic
 */
export const trackAISuggestionApplied = (modelUsed, suggestionLength, isArabic = true) => {
  posthog.capture('ai_suggestion_applied', {
    model_used: modelUsed,
    suggestion_length: suggestionLength,
    is_arabic: isArabic,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Track Arabic text copied
 * @param {number} textLength - Length of text copied
 * @param {string} context - Where it was copied from ('focus_chat', 'editing', etc)
 * @param {boolean} isAISuggestion - Whether it was from AI suggestion
 */
export const trackArabicTextCopied = (textLength, context = 'focus_chat', isAISuggestion = false) => {
  posthog.capture('arabic_text_copied', {
    text_length: textLength,
    context: context,
    is_ai_suggestion: isAISuggestion,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Track Arabic text selected/highlighted
 * @param {number} textLength - Length of text selected
 */
export const trackArabicTextSelected = (textLength) => {
  posthog.capture('arabic_text_selected', {
    text_length: textLength,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Track Arabic text edited manually
 * @param {number} textLength - Length of edited text
 */
export const trackArabicTextEdited = (textLength) => {
  posthog.capture('arabic_text_edited', {
    text_length: textLength,
    manually_edited: true,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Track chat message interaction
 * @param {string} role - 'user' or 'bot'
 * @param {string} model - AI model used (for bot messages)
 */
export const trackChatInteraction = (role, model = null) => {
  posthog.capture('chat_interaction', {
    role: role,
    model_used: model,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Generic event tracking
 * @param {string} eventName - Name of the event
 * @param {object} properties - Additional properties
 */
export const trackEvent = (eventName, properties = {}) => {
  posthog.capture(eventName, {
    ...properties,
    timestamp: new Date().toISOString(),
  });
};

export default {
  trackFileSelected,
  trackTranslationStarted,
  trackTranslationCompleted,
  trackDocumentDownloaded,
  trackNavigation,
  trackSessionStarted,
  trackFocusPanelSession,
  trackEditingInterfaceSession,
  trackAISuggestionApplied,
  trackArabicTextCopied,
  trackArabicTextSelected,
  trackArabicTextEdited,
  trackChatInteraction,
  trackEvent,
};
