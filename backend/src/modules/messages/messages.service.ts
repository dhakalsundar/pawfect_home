import type { Types } from 'mongoose';
import { Conversation, type IConversation } from '../../models/Conversation.js';
import { Message, type IMessage } from '../../models/Message.js';
import { User } from '../../models/User.js';
import { Pet } from '../../models/Pet.js';
import { Shelter } from '../../models/Shelter.js';
import { ApiError } from '../../utils/ApiError.js';
import { emitToUser, getIo, room } from '../../sockets/index.js';
import { createNotification } from '../notifications/notifications.service.js';

export interface ConversationDTO {
  id: string;
  other: { id: string; name: string; avatar?: string };
  pet?: { id: string; slug: string; name: string; image: string };
  shelter?: { id: string; name: string; slug: string };
  lastMessage?: { body: string; at: string; fromMe: boolean };
  unread: number;
  updatedAt: string;
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

interface Populated {
  _id: unknown;
  [key: string]: unknown;
}

function toMessageDTO(message: IMessage): MessageDTO {
  return {
    id: String(message._id),
    conversationId: String(message.conversation),
    senderId: String(message.sender),
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  };
}

function toConversationDTO(conversation: IConversation, viewerId: string): ConversationDTO {
  const participants = conversation.participants as unknown as Populated[];
  const other = participants.find((participant) => String(participant._id) !== viewerId);
  const pet = conversation.pet as unknown as Populated | undefined;
  const shelter = conversation.shelter as unknown as Populated | undefined;

  const images = (pet?.images as { url: string; isPrimary: boolean }[] | undefined) ?? [];
  const primary = images.find((image) => image.isPrimary) ?? images[0];

  // A Mongoose Map survives .lean() as a plain object, so handle both shapes.
  const unreadMap = conversation.unread as unknown;
  const unread =
    unreadMap instanceof Map
      ? (unreadMap.get(viewerId) ?? 0)
      : ((unreadMap as Record<string, number> | undefined)?.[viewerId] ?? 0);

  return {
    id: String(conversation._id),
    other: {
      id: String(other?._id ?? ''),
      name: String(other?.name ?? 'Unknown'),
      ...((other?.avatar as { url?: string } | undefined)?.url
        ? { avatar: (other!.avatar as { url: string }).url }
        : {}),
    },
    ...(pet?.name
      ? {
          pet: {
            id: String(pet._id),
            slug: String(pet.slug ?? ''),
            name: String(pet.name),
            image: primary?.url ?? '',
          },
        }
      : {}),
    ...(shelter?.name
      ? { shelter: { id: String(shelter._id), name: String(shelter.name), slug: String(shelter.slug ?? '') } }
      : {}),
    ...(conversation.lastMessage?.body
      ? {
          lastMessage: {
            body: conversation.lastMessage.body,
            at: conversation.lastMessage.at.toISOString(),
            fromMe: String(conversation.lastMessage.sender) === viewerId,
          },
        }
      : {}),
    unread,
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

/**
 * Loads a conversation only if the caller is a participant.
 *
 * Membership is expressed as a query condition, so a non-participant cannot express a query that
 * reaches the row — and "not yours" is indistinguishable from "doesn't exist".
 */
export async function requireParticipant(conversationId: string, userId: string) {
  const conversation = await Conversation.findOne({
    _id: conversationId,
    participants: userId,
  });
  if (!conversation) throw ApiError.notFound('Conversation');
  return conversation;
}

const POPULATE = [
  { path: 'participants', select: 'name avatar' },
  { path: 'pet', select: 'slug name images' },
  { path: 'shelter', select: 'name slug' },
];

export async function listConversations(userId: string) {
  const conversations = await Conversation.find({ participants: userId })
    .sort({ updatedAt: -1, _id: -1 })
    .limit(50)
    .populate(POPULATE)
    .lean<IConversation[]>();

  return conversations.map((conversation) => toConversationDTO(conversation, userId));
}

/**
 * Finds or creates the thread between two people about a pet.
 *
 * Returns the existing one rather than erroring: "message this shelter" should be idempotent, and
 * a second click must not split the history.
 */
export async function startConversation(userId: string, recipientId: string, petId?: string) {
  if (userId === recipientId) {
    throw ApiError.validation('You cannot start a conversation with yourself.');
  }

  const recipient = await User.findOne({ _id: recipientId, deletedAt: null }).select('_id').lean();
  if (!recipient) throw ApiError.notFound('User');

  let shelterId: Types.ObjectId | undefined;
  if (petId) {
    const pet = await Pet.findOne({ _id: petId, deletedAt: null }).select('shelter').lean();
    if (!pet) throw ApiError.notFound('Pet');
    shelterId = pet.shelter;
  }

  const participants = [userId, recipientId];

  // Looks up by the same key the unique index enforces, so "find" and "would this insert conflict"
  // can never disagree.
  const existing = await Conversation.findOne({
    pairKey: [...participants].sort().join(':'),
    ...(petId ? { pet: petId } : { pet: { $exists: false } }),
  }).populate(POPULATE);

  if (existing) return toConversationDTO(existing.toObject() as IConversation, userId);

  const conversation = await Conversation.create({
    participants,
    ...(petId ? { pet: petId } : {}),
    ...(shelterId ? { shelter: shelterId } : {}),
    unread: new Map<string, number>(),
  });

  await conversation.populate(POPULATE);
  return toConversationDTO(conversation.toObject() as IConversation, userId);
}

/**
 * Cursor pagination, newest first.
 *
 * Cursor rather than skip/limit: an active thread gains messages while the user scrolls, and
 * offset paging would then repeat or skip rows. An `_id` cursor is stable regardless.
 */
export async function listMessages(conversationId: string, userId: string, before?: string, limit = 30) {
  await requireParticipant(conversationId, userId);

  const filter: Record<string, unknown> = { conversation: conversationId, deletedAt: null };
  if (before) filter._id = { $lt: before };

  const messages = await Message.find(filter)
    .sort({ _id: -1 })
    .limit(limit)
    .lean<IMessage[]>();

  return {
    // Reversed so the client renders oldest-to-newest without re-sorting.
    items: messages.reverse().map(toMessageDTO),
    nextCursor: messages.length === limit ? String(messages[0]?._id) : null,
  };
}

export async function sendMessage(conversationId: string, senderId: string, body: string) {
  const conversation = await requireParticipant(conversationId, senderId);

  const message = await Message.create({
    conversation: conversationId,
    sender: senderId,
    body,
    readBy: [{ user: senderId, at: new Date() }],
  });

  const recipientId = conversation.participants
    .map(String)
    .find((participant) => participant !== senderId);

  conversation.lastMessage = { body, sender: senderId as never, at: message.createdAt };
  if (recipientId) {
    conversation.unread.set(recipientId, (conversation.unread.get(recipientId) ?? 0) + 1);
  }
  // Touch updatedAt so the thread rises to the top of both inboxes.
  conversation.markModified('unread');
  await conversation.save();

  const dto = toMessageDTO(message.toObject() as IMessage);

  // To everyone currently viewing the thread, including the sender's other tabs.
  getIo()?.to(room.conversation(conversationId)).emit('message:new', dto);

  if (recipientId) {
    // Separately to the recipient's personal room, so their inbox badge updates even if they
    // are not looking at this conversation.
    emitToUser(recipientId, 'message:inbox', {
      conversationId,
      preview: body.slice(0, 120),
      at: dto.createdAt,
    });

    const sender = await User.findById(senderId).select('name').lean();
    await createNotification({
      recipient: recipientId,
      actor: senderId,
      type: 'new_message',
      title: `New message from ${sender?.name ?? 'someone'}`,
      body: body.slice(0, 140),
      link: `/dashboard/messages?c=${conversationId}`,
      entity: { kind: 'message', id: message._id },
    });
  }

  return dto;
}

export async function markConversationRead(conversationId: string, userId: string) {
  const conversation = await requireParticipant(conversationId, userId);

  conversation.unread.set(userId, 0);
  conversation.markModified('unread');
  await conversation.save();

  // Keeps the reader's other tabs in step.
  emitToUser(userId, 'message:read', { conversationId });

  return { unread: 0 };
}

export async function getUnreadTotal(userId: string): Promise<number> {
  const conversations = await Conversation.find({ participants: userId }).select('unread').lean();

  return conversations.reduce((total, conversation) => {
    const unreadMap = conversation.unread as unknown;
    const count =
      unreadMap instanceof Map
        ? (unreadMap.get(userId) ?? 0)
        : ((unreadMap as Record<string, number> | undefined)?.[userId] ?? 0);
    return total + count;
  }, 0);
}

/** Resolves the user to message about a pet — the shelter's owner. */
export async function resolvePetRecipient(petId: string): Promise<string> {
  const pet = await Pet.findOne({ _id: petId, deletedAt: null }).select('shelter').lean();
  if (!pet) throw ApiError.notFound('Pet');

  const shelter = await Shelter.findById(pet.shelter).select('owner').lean();
  if (!shelter?.owner) throw ApiError.notFound('Shelter');

  return String(shelter.owner);
}
