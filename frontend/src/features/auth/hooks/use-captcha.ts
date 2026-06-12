'use client';

import { useCallback, useState } from 'react';
import { authService, type CaptchaAnswer, type CaptchaChallenge } from '@/services/auth.service';

interface UseCaptcha {
  /** True once the API has demanded a challenge for this session. */
  required: boolean;
  challenge: CaptchaChallenge | null;
  answer: string;
  loading: boolean;
  setAnswer: (value: string) => void;
  /** Turn the gate on and fetch the first challenge (idempotent while one is showing). */
  activate: () => Promise<void>;
  /** Fetch a new challenge and clear the answer — a token is single-use, so every retry needs one. */
  refresh: () => Promise<void>;
  /** The fields to merge into a login/register payload; empty when no challenge is active. */
  payload: () => CaptchaAnswer;
  reset: () => void;
}

/**
 * Reactive CAPTCHA state shared by the login and register forms. The gate is server-driven: the
 * form attempts a submit, and only if the API answers CAPTCHA_REQUIRED does it call `activate`.
 * After any failed attempt while active, the form calls `refresh` because the previous token was
 * consumed (or expired).
 */
export function useCaptcha(): UseCaptcha {
  const [required, setRequired] = useState(false);
  const [challenge, setChallenge] = useState<CaptchaChallenge | null>(null);
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchChallenge = useCallback(async () => {
    setLoading(true);
    try {
      setChallenge(await authService.captcha());
      setAnswer('');
    } finally {
      setLoading(false);
    }
  }, []);

  const activate = useCallback(async () => {
    setRequired(true);
    await fetchChallenge();
  }, [fetchChallenge]);

  const refresh = useCallback(async () => {
    if (!required) return;
    await fetchChallenge();
  }, [required, fetchChallenge]);

  const payload = useCallback((): CaptchaAnswer => {
    if (!required || !challenge) return {};
    return { captchaToken: challenge.token, captchaAnswer: answer };
  }, [required, challenge, answer]);

  const reset = useCallback(() => {
    setRequired(false);
    setChallenge(null);
    setAnswer('');
  }, []);

  return { required, challenge, answer, loading, setAnswer, activate, refresh, payload, reset };
}
