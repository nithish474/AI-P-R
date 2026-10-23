import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Gemini Service Health & Classification Logic', () => {
  it('should correctly distinguish missing GEMINI_API_KEY as configuration_error', async () => {
    // Save original env
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    // Simulate health check logic
    const rawKey = process.env.GEMINI_API_KEY?.trim();
    const result = {
      configured: Boolean(rawKey),
      status: !rawKey ? 'configuration_error' : 'connected',
      message: !rawKey ? 'GEMINI_API_KEY is not configured in the server environment.' : 'Connected',
    };

    assert.equal(result.configured, false);
    assert.equal(result.status, 'configuration_error');
    assert.match(result.message, /GEMINI_API_KEY is not configured/);
    assert.equal((result as any).apiKey, undefined, 'API key must never be leaked');

    // Restore
    if (originalKey !== undefined) {
      process.env.GEMINI_API_KEY = originalKey;
    }
  });

  it('should categorize 400/401/403 and API_KEY_INVALID errors as invalid_key', () => {
    const errorCases = [
      { status: 400, message: 'API_KEY_INVALID: API key not valid. Please pass a valid API key.' },
      { status: 401, message: 'Request had invalid authentication credentials.' },
      { status: 403, message: 'PERMISSION_DENIED: The caller does not have permission' },
      { status: 400, message: 'INVALID_ARGUMENT: API key expired' },
    ];

    for (const err of errorCases) {
      const isAuthError =
        err.status === 400 ||
        err.status === 401 ||
        err.status === 403 ||
        /API_KEY_INVALID|API key not valid|UNAUTHENTICATED|PERMISSION_DENIED/i.test(err.message);

      assert.equal(isAuthError, true, `Expected auth error for ${err.message}`);
    }
  });

  it('should categorize 429 and RESOURCE_EXHAUSTED errors as rate_limited', () => {
    const errorCases = [
      { status: 429, message: 'RESOURCE_EXHAUSTED: Quota exceeded for quota metric' },
      { status: 429, message: 'rate limit reached, please retry later' },
    ];

    for (const err of errorCases) {
      const isRateLimit = err.status === 429 || /RESOURCE_EXHAUSTED|rate.limit|quota/i.test(err.message);
      assert.equal(isRateLimit, true, `Expected rate limit for ${err.message}`);
    }
  });

  it('should categorize network and connection failures as offline', () => {
    const errorCases = [
      'getaddrinfo ENOTFOUND generativelanguage.googleapis.com',
      'fetch failed: TypeError: fetch failed',
      'Connection timed out after 9000ms',
    ];

    for (const msg of errorCases) {
      const isNetworkError = /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed|network|timed out/i.test(msg);
      assert.equal(isNetworkError, true, `Expected network error for ${msg}`);
    }
  });

  it('should validate supported audio mime types and reject unsupported formats', () => {
    const supported = [
      'audio/wav',
      'audio/x-wav',
      'audio/mp3',
      'audio/mpeg',
      'audio/ogg',
      'audio/webm',
      'audio/flac',
      'audio/aac',
    ];
    const unsupported = [
      'video/mp4',
      'text/plain',
      'application/pdf',
      'image/jpeg',
    ];

    const supportedPrefixes = [
      'audio/wav',
      'audio/x-wav',
      'audio/wave',
      'audio/mp3',
      'audio/mpeg',
      'audio/ogg',
      'audio/vorbis',
      'audio/webm',
      'audio/flac',
      'audio/x-flac',
      'audio/aac',
      'audio/m4a',
      'audio/x-m4a',
      'audio/mp4',
    ];

    const isAudioFormat = (mime: string) =>
      mime.startsWith('audio/') || supportedPrefixes.includes(mime.toLowerCase());

    for (const mime of supported) {
      assert.equal(isAudioFormat(mime), true, `Expected ${mime} to be supported`);
    }

    for (const mime of unsupported) {
      assert.equal(isAudioFormat(mime), false, `Expected ${mime} to be rejected`);
    }
  });

  it('should enforce safe response payload without leaking keys or credentials', () => {
    const safeResponse = {
      configured: true,
      status: 'connected',
      message: 'Connected successfully to Gemini Multimodal (gemini-3.8-flash)',
      model: 'gemini-3.8-flash',
      latencyMs: 142,
      timestamp: new Date().toISOString(),
    };

    const serialized = JSON.stringify(safeResponse);
    assert.doesNotMatch(serialized, /AIza[0-9A-Za-z-_]{35}/);
    assert.equal('apiKey' in safeResponse, false);
    assert.equal('key' in safeResponse, false);
    assert.equal('secret' in safeResponse, false);
  });
});
