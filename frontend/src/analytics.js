// PostHog Analytics Events Helper
// Centralized place to track all analytics events

import posthog from './posthogConfig';
import { trackApiError, trackFileError } from './errorTracking';

/**
 * Track file selection event
 * @param {string} fileType - 'pdf' or 'xliff'
 * @param {number} fileSize - Size of file in bytes
 * @param {string} fileName - Original selected file name
 */
export const trackFileSelected = (fileType, fileSize, fileName) => {
  posthog.capture('fileSelected', {
    file_type: fileType,
    file_size: fileSize,
    file_size_kb: Math.round(fileSize / 1024),
    file_name: fileName,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Track wrong file upload attempt
 * @param {string} fileName - Name of the wrong file
 * @param {string} uploadTarget - Where they tried to upload it ('main_document', 'glossary', 'translation_memory')
 */
export const trackWrongFileUploaded = (fileName, uploadTarget) => {
  const ext = fileName.split('.').pop()?.toLowerCase() || 'unknown';
  posthog.capture('wrong_file_uploaded', {
    file_name: fileName,
    file_extension: ext,
    upload_target: uploadTarget,
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
 * @param {number} totalBlocks - Total number of blocks translated
 * @param {boolean} success - Whether translation was successful
 */
export const trackTranslationCompleted = (fileType, fileSize, durationMs, totalBlocks, success = true) => {
  const isRealDocument = fileSize > 50000;

  posthog.capture('translation_completed', {
    file_type: fileType,
    file_size: fileSize,
    file_size_kb: Math.round(fileSize / 1024),
    duration_minutes: Math.round(durationMs / 1000 / 60),
    total_blocks: totalBlocks,
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

/**
 * Track translation API error
 * @param {Error} error - The error object
 * @param {Object} context - Additional context
 */
export const trackTranslationError = (error, context = {}) => {
  trackApiError(error, {
    endpoint: '/translate',
    method: 'POST',
    action: 'Translating document',
    context: {
      ...context,
    },
  });
};

/**
 * Track file processing error
 * @param {Error} error - The error object
 * @param {Object} context - File and operation details
 */
export const trackFileProcessingError = (error, context = {}) => {
  trackFileError(error, {
    ...context,
  });
};

/**
 * Track segment service error
 * @param {Error} error - The error object
 * @param {string} operation - What operation failed
 */
export const trackSegmentError = (error, operation = 'unknown') => {
  trackApiError(error, {
    endpoint: '/segments',
    action: `Segment operation: ${operation}`,
  });
};

/**
 * Track keyboard shortcut usage
 * @param {string} shortcut - e.g. 'ctrl+enter', 'ctrl+s', 'ctrl+i', 'escape', 'ctrl+e', 'ctrl+digit'
 * @param {string} action - What the shortcut did, e.g. 'confirm_segment', 'split_segment'
 * @param {string} context - Where it was used, e.g. 'compare_interface', 'general_chat'
 */
export const trackShortcutUsed = (shortcut, action, context) => {
  posthog.capture('shortcut_used', {
    shortcut,
    action,
    context,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Track a glossary/TM upload that failed after passing the file-type check
 * (network error, backend rejection, malformed file, etc) — distinct from
 * trackWrongFileUploaded, which covers picking the wrong file type.
 * @param {string} uploadTarget - 'glossary' | 'translation_memory'
 * @param {string} fileName
 * @param {number} fileSize
 * @param {Error} error - The error object
 */
export const trackAttachmentUploadFailed = (uploadTarget, fileName, fileSize, error) => {
  trackFileError(error, {
    upload_target: uploadTarget,
    file_name: fileName,
    file_size: fileSize,
  });
};

/**
 * Track a decision made on an AI-generated suggestion, across every place a
 * suggestion can be shown (focus chat diff, document review banner, chat
 * suggestion banner, batch apply/dismiss all). Use alongside trackAISuggestionApplied
 * where that already exists — this covers the "discarded/dismissed" half that
 * was previously untracked, so acceptance rate can actually be computed.
 * @param {string} source - 'focus_chat_diff' | 'review_banner' | 'chat_suggestion_banner' | 'batch'
 * @param {string} decision - 'applied' | 'discarded'
 * @param {object} extra - additional context (count, segment_id, model, etc)
 */
export const trackSuggestionDecision = (source, decision, extra = {}) => {
  posthog.capture('suggestion_decision', {
    source,
    decision,
    ...extra,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Track the full-document AI review lifecycle (handleReviewDocument)
 * @param {string} phase - 'started' | 'completed' | 'error'
 * @param {object} extra - e.g. total_segments, revised_segments, duration_ms
 */
export const trackDocumentReview = (phase, extra = {}) => {
  posthog.capture('document_review', {
    phase,
    ...extra,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Track a segment being split into two
 * @param {string} via - 'shortcut' | 'button'
 * @param {object} extra - e.g. page_index, block_index
 */
export const trackSegmentSplit = (via, extra = {}) => {
  posthog.capture('segment_split', {
    via,
    ...extra,
    timestamp: new Date().toISOString(),
  });
};

export default {
  trackFileSelected,
  trackWrongFileUploaded,
  trackTranslationStarted,
  trackTranslationCompleted,
  trackDocumentDownloaded,
  trackNavigation,
  trackSessionStarted,
  trackEditingInterfaceSession,
  trackAISuggestionApplied,
  trackArabicTextCopied,
  trackArabicTextSelected,
  trackArabicTextEdited,
  trackChatInteraction,
  trackEvent,
  trackTranslationError,
  trackFileProcessingError,
  trackSegmentError,
  trackShortcutUsed,
  trackAttachmentUploadFailed,
  trackSuggestionDecision,
  trackDocumentReview,
  trackSegmentSplit,
};