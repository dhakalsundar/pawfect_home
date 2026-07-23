'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useThread } from '../use-thread';
import type { ConversationSummary } from '@/types/message';

interface Props {
  conversation: ConversationSummary;
  currentUserId: string | undefined;
  onBack: () => void;
}

export function MessageThread({ conversation, currentUserId, onBack }: Props) {
  const { messages, loading, sending, otherTyping, hasMore, loadOlder, send, setTyping } = useThread(
    conversation.id,
    currentUserId,
  );

  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingSent = useRef(false);

  // Scroll to the newest message when the thread changes or a message arrives.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, conversation.id]);

  /**
   * Emit "typing" once on the first keystroke and "stopped" after a pause, rather than on every
   * keystroke — one event per character would be a packet per keypress for no extra information.
   */
  useEffect(() => {
    if (!draft) {
      if (typingSent.current) {
        setTyping(false);
        typingSent.current = false;
      }
      return;
    }

    if (!typingSent.current) {
      setTyping(true);
      typingSent.current = true;
    }

    const timer = setTimeout(() => {
      setTyping(false);
      typingSent.current = false;
    }, 2000);

    return () => clearTimeout(timer);
  }, [draft, setTyping]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    setTyping(false);
    typingSent.current = false;
    await send(body);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-border/60 flex items-center gap-3 border-b p-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="md:hidden"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="size-5" />
        </Button>

        <div className="min-w-0">
          <p className="truncate font-semibold">{conversation.other.name}</p>
          {conversation.pet ? (
            <Link
              href={`/pets/${conversation.pet.slug}`}
              className="text-muted-foreground hover:text-foreground truncate text-xs underline-offset-2 hover:underline"
            >
              About {conversation.pet.name}
            </Link>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {hasMore ? (
          <div className="text-center">
            <Button variant="ghost" size="sm" onClick={() => void loadOlder()} disabled={loading}>
              {loading ? 'Loading…' : 'Load earlier messages'}
            </Button>
          </div>
        ) : null}

        {loading && messages.length === 0 ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading messages">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className={cn(
                  'bg-muted/60 h-12 animate-pulse rounded-2xl',
                  index % 2 === 0 ? 'mr-auto w-2/3' : 'ml-auto w-1/2',
                )}
              />
            ))}
          </div>
        ) : null}

        {!loading && messages.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No messages yet — say hello.
          </p>
        ) : null}

        {messages.map((message) => {
          const isMine = message.senderId === currentUserId;
          return (
            <div
              key={message.id}
              className={cn('flex flex-col gap-1', isMine ? 'items-end' : 'items-start')}
            >
              <div
                className={cn(
                  'max-w-[80%] rounded-2xl px-4 py-2 text-sm break-words',
                  isMine
                    ? 'bg-brand-gradient text-white'
                    : 'bg-muted text-foreground',
                  message.pending && 'opacity-60',
                  message.failed && 'ring-destructive ring-2',
                )}
              >
                {message.body}
              </div>

              <span className="text-muted-foreground flex items-center gap-1 px-1 text-[11px]">
                {message.failed ? (
                  <>
                    <AlertCircle className="size-3" aria-hidden />
                    Not sent
                  </>
                ) : message.pending ? (
                  'Sending…'
                ) : (
                  <time dateTime={message.createdAt}>
                    {new Date(message.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                )}
              </span>
            </div>
          );
        })}

        {/* aria-live so a screen reader hears the indicator without it stealing focus. */}
        <p className="text-muted-foreground h-4 text-xs italic" aria-live="polite">
          {otherTyping ? `${conversation.other.name} is typing…` : ''}
        </p>

        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-border/60 flex items-end gap-2 border-t p-4">
        <label htmlFor="message-body" className="sr-only">
          Message {conversation.other.name}
        </label>
        <textarea
          id="message-body"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter breaks the line — the convention everywhere else.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void handleSubmit(event);
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Write a message…"
          className="border-input bg-background focus-visible:ring-ring max-h-32 min-h-[2.75rem] flex-1 resize-y rounded-2xl border px-4 py-2.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
        <Button
          type="submit"
          size="icon"
          disabled={sending || draft.trim().length === 0}
          className="size-11 shrink-0 rounded-full"
          aria-label="Send message"
        >
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
