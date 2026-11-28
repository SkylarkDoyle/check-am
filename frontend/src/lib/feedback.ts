import { CheckAmApiError, FeedbackKind, api } from '../api/client';
import { getDeviceId } from './deviceId';

export const APP_VERSION = '1.0.0';

export interface FeedbackContext {
  screen?: string;
  reg_number?: string;
  query?: string;
}

/** A friendly sentence for each way sending can fail. */
export function feedbackErrorMessage(err: unknown): string {
  if (err instanceof CheckAmApiError) {
    if (err.code === 'FEEDBACK_RATE_LIMITED') return 'You have sent a lot of feedback. Please try again later.';
    if (err.code === 'FEEDBACK_MESSAGE_REQUIRED') return 'Please write a short message first.';
    if (err.code === 'FEEDBACK_REJECTED') return 'That message could not be sent. Please remove links and try again.';
    if (err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT') return 'No connection. Please try again when you are online.';
  }
  return 'Could not send right now. Please try again.';
}

export async function submitFeedback(input: {
  kind: FeedbackKind;
  message?: string;
  contact?: string;
  website?: string;
  context?: FeedbackContext;
}): Promise<void> {
  await api.sendFeedback(
    {
      kind: input.kind,
      message: input.message?.trim() || null,
      contact: input.contact?.trim() || null,
      website: input.website || null,
      context: { ...input.context, app_version: APP_VERSION },
    },
    await getDeviceId()
  );
}

/** One-tap "was this helpful?". Failure is silent: it must never get in the person's way. */
export async function sendHelpful(yes: boolean, context?: FeedbackContext): Promise<boolean> {
  try {
    await submitFeedback({ kind: yes ? 'helpful_yes' : 'helpful_no', context });
    return true;
  } catch {
    return false;
  }
}
