'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/types/notification';
import type { ConversationSummary } from '@/types/message';

interface Props {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function ConversationList({ conversations, activeId, onSelect }: Props) {
  if (conversations.length === 0) {
    return (
      <div className="text-muted-foreground p-8 text-center text-sm">
        <p className="font-medium">No conversations yet</p>
        <p className="mt-1">
          Find a pet you love and use <span className="font-medium">Message shelter</span> to start
          one.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-border/60 divide-y">
      {conversations.map((conversation) => {
        const isActive = conversation.id === activeId;
        return (
          <li key={conversation.id}>
            <button
              type="button"
              onClick={() => onSelect(conversation.id)}
              aria-current={isActive ? 'true' : undefined}
              className={cn(
                'hover:bg-muted/60 focus-visible:ring-ring flex w-full items-center gap-3 p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none',
                isActive && 'bg-muted',
              )}
            >
              <div className="bg-muted relative size-11 shrink-0 overflow-hidden rounded-full">
                {conversation.pet?.image ? (
                  <Image
                    src={conversation.pet.image}
                    alt=""
                    fill
                    sizes="44px"
                    className="object-cover"
                  />
                ) : (
                  <span className="text-muted-foreground flex size-full items-center justify-center text-sm font-semibold">
                    {conversation.other.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate font-medium">{conversation.other.name}</p>
                  <time
                    dateTime={conversation.updatedAt}
                    className="text-muted-foreground shrink-0 text-xs"
                  >
                    {timeAgo(conversation.updatedAt)}
                  </time>
                </div>

                {conversation.pet ? (
                  <p className="text-muted-foreground truncate text-xs">
                    About {conversation.pet.name}
                  </p>
                ) : null}

                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <p
                    className={cn(
                      'text-muted-foreground truncate text-sm',
                      conversation.unread > 0 && 'text-foreground font-medium',
                    )}
                  >
                    {conversation.lastMessage
                      ? `${conversation.lastMessage.fromMe ? 'You: ' : ''}${conversation.lastMessage.body}`
                      : 'No messages yet'}
                  </p>

                  {conversation.unread > 0 ? (
                    <span
                      className="bg-brand-gradient flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                      aria-label={`${conversation.unread} unread`}
                    >
                      {conversation.unread > 9 ? '9+' : conversation.unread}
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
