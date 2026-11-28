import React, { useEffect, useState } from 'react';
import { FeedbackKind } from '../api/client';
import { FeedbackContext, feedbackErrorMessage, submitFeedback } from '../lib/feedback';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Chip } from './Chip';

const KINDS: { kind: FeedbackKind; label: string }[] = [
  { kind: 'bug', label: 'Bug' },
  { kind: 'wrong_data', label: 'Wrong data' },
  { kind: 'idea', label: 'Idea' },
  { kind: 'other', label: 'Other' },
];
const MAX = 1000;

export interface FeedbackSheetProps {
  isOpen: boolean;
  onClose: () => void;
  context?: FeedbackContext;
  /** Which kind starts selected. */
  initialKind?: FeedbackKind;
}

/** Send feedback sheet. Doop frames "Feedback / Sheet", "Feedback / Sheet from result", "Feedback / Sent". */
export const FeedbackSheet: React.FC<FeedbackSheetProps> = ({ isOpen, onClose, context, initialKind = 'bug' }) => {
  const [kind, setKind] = useState<FeedbackKind>(initialKind);
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [website, setWebsite] = useState(''); // honeypot, stays empty for people
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setKind(initialKind);
      setMessage('');
      setContact('');
      setStatus('idle');
      setError('');
    }
  }, [isOpen, initialKind]);

  const send = async () => {
    if (message.trim().length < 3) {
      setError('Please write a short message first.');
      return;
    }
    setStatus('sending');
    setError('');
    try {
      await submitFeedback({ kind, message, contact, website, context });
      setStatus('sent');
    } catch (err) {
      setError(feedbackErrorMessage(err));
      setStatus('idle');
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={status === 'sent' ? undefined : 'Send feedback'}>
      {status === 'sent' ? (
        <div className="flex flex-col items-stretch gap-3 py-2 text-center">
          <div className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full bg-ok-bg text-ok">
            <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12l5 5 9-10" />
            </svg>
          </div>
          <h2 className="font-display text-[22px] font-black">Thanks, we got it</h2>
          <p className="text-sm text-ink-muted">Your message was sent. If you left a contact, we may reply.</p>
          <Button tone="primary" width="full" label="Done" onClick={onClose} />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-snug text-ink-muted">
            Tell us what happened or what would make CheckAm better. We read every message.
          </p>
          {context?.reg_number && (
            <span className="inline-flex self-start rounded-full border-thin border-line bg-surface-alt px-3 py-1 text-xs font-bold">
              About {context.reg_number}
            </span>
          )}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Type of feedback">
            {KINDS.map((k) => (
              <Chip key={k.kind} label={k.label} active={kind === k.kind} onClick={() => setKind(k.kind)} />
            ))}
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MAX))}
            placeholder="What happened? What did you expect?"
            aria-label="Your message"
            rows={4}
            className="min-h-[110px] w-full resize-none rounded-md border-2 border-ink bg-surface p-3 text-[15px] text-ink outline-none"
          />
          <div className="-mt-2 text-right font-mono text-[11px] text-ink-muted">{message.length} / {MAX}</div>
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value.slice(0, 120))}
            placeholder="Email or phone (optional)"
            aria-label="Email or phone (optional)"
            autoComplete="off"
            className="w-full rounded-md border-2 border-line bg-surface p-3 text-[15px] text-ink outline-none"
          />
          <p className="text-xs text-ink-muted">We only use this to reply. No account needed.</p>
          {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
          <input
            tabIndex={-1}
            aria-hidden="true"
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            name="website"
            className="absolute -left-[9999px] h-0 w-0 opacity-0"
          />
          {error && (
            <p className="text-sm font-bold text-alert" role="alert">
              {error}
            </p>
          )}
          <Button
            tone="primary"
            width="full"
            label={status === 'sending' ? 'Sending…' : 'Send feedback'}
            disabled={status === 'sending'}
            onClick={send}
          />
          <button type="button" onClick={onClose} className="text-center text-sm font-extrabold underline">
            Cancel
          </button>
        </div>
      )}
    </BottomSheet>
  );
};
