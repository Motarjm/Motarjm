// PostHog Analytics Configuration
import posthog from 'posthog-js';

export const initPostHog = () => {
  try {
    const apiKey = import.meta.env.VITE_POSTHOG_API_KEY;;
    const apiHost = "https://eu.i.posthog.com";

    // Skip initialization if API key is not configured
    if (!apiKey || apiKey === 'phc_your_key_here') {
      console.warn('⚠️ PostHog API key not configured. Analytics disabled.');
      return;
    }

    posthog.init(apiKey, {
      api_host: apiHost,
      // PostHog automatically creates sessions; default is 30 min idle timeout
      session_timeout_seconds: 60 * 30, // 30 minutes of inactivity = new session
      
      // Disable session recordings to save bandwidth and improve privacy
      disable_session_recording: true,
      persistence: 'localStorage', // Store session data in localStorage
    });

    // Generate or retrieve anonymous session ID from localStorage
    // PostHog will automatically create a distinct ID if not provided
    const anonId = localStorage.getItem('posthog_anon_id');
    if (!anonId) {
      const newAnonId = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('posthog_anon_id', newAnonId);
      posthog.identify(newAnonId);
    } else {
      posthog.identify(anonId);
    }
  } catch (error) {
    console.error('❌ PostHog initialization failed:', error);
  }
};

export default posthog;
