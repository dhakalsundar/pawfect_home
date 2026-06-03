/**
 * A tiny, dependency-free user-agent formatter for the active-sessions list. It is intentionally
 * coarse — "Chrome on Windows" is all a user needs to recognise a device — and never used for any
 * security decision (the binding on the server compares the raw string).
 */
export function describeUserAgent(ua?: string): { browser: string; os: string } {
  if (!ua) return { browser: 'Unknown browser', os: 'Unknown device' };

  const os =
    /windows nt/i.test(ua) ? 'Windows'
    : /iphone|ipad|ipod/i.test(ua) ? 'iOS'
    : /android/i.test(ua) ? 'Android'
    : /mac os x/i.test(ua) ? 'macOS'
    : /linux/i.test(ua) ? 'Linux'
    : 'Unknown device';

  const browser =
    /edg\//i.test(ua) ? 'Edge'
    : /opr\/|opera/i.test(ua) ? 'Opera'
    : /chrome\//i.test(ua) ? 'Chrome'
    : /firefox\//i.test(ua) ? 'Firefox'
    : /safari\//i.test(ua) ? 'Safari'
    : /curl|powershell|node|python|axios|okhttp/i.test(ua) ? 'API client'
    : 'Browser';

  return { browser, os };
}
