import type { QueryFilter, Types } from 'mongoose';
import { Notification, type INotification, type NotificationType } from '../../models/Notification.js';
import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { buildMeta } from '../../utils/ApiResponse.js';
import { logger } from '../../config/logger.js';
import { emitToUser } from '../../sockets/index.js';

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

export function toNotificationDTO(notification: INotification): NotificationDTO {
  return {
    id: String(notification._id),
    type: notification.type,
    title: notification.title,
    ...(notification.body ? { body: notification.body } : {}),
    ...(notification.link ? { link: notification.link } : {}),
    isRead: notification.isRead,
    createdAt: notification.createdAt.toISOString(),
  };
}

interface CreateNotificationInput {
  recipient: Types.ObjectId | string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  actor?: Types.ObjectId | string;
  entity?: { kind: string; id: Types.ObjectId | string };
}

/**
 * Persists a notification, then pushes it over the socket.
 *
 * Order matters: the database write is the source of truth, so a user who is offline (or whose
 * socket drops mid-emit) still finds the notification waiting at next login. The emit is a
 * best-effort enhancement layered on top.
 *
 * Never throws — a notification failing must not fail the action that triggered it.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<NotificationDTO | null> {
  try {
    const notification = await Notification.create({
      recipient: input.recipient,
      type: input.type,
      title: input.title,
      ...(input.body ? { body: input.body } : {}),
      ...(input.link ? { link: input.link } : {}),
      ...(input.actor ? { actor: input.actor } : {}),
      ...(input.entity ? { entity: input.entity } : {}),
    });

    const dto = toNotificationDTO(notification.toObject() as INotification);
    const unreadCount = await getUnreadCount(String(input.recipient));

    emitToUser(String(input.recipient), 'notification:new', { notification: dto, unreadCount });

    return dto;
  } catch (error) {
    logger.error({ err: error, input }, 'Failed to create notification');
    return null;
  }
}

/** Fan-out helper for the cases that notify several people at once. */
export async function createNotifications(inputs: CreateNotificationInput[]): Promise<void> {
  await Promise.all(inputs.map(createNotification));
}

export async function listNotifications(
  userId: string,
  query: { unread?: boolean; page: number; limit: number },
) {
  const filter: QueryFilter<INotification> = { recipient: userId };
  if (query.unread) filter.isRead = false;

  const skip = (query.page - 1) * query.limit;

  const [notifications, total] = await Promise.all([
    // _id tiebreaker: several notifications can share a createdAt second, and without it
    // pagination would drop and duplicate rows.
    Notification.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(query.limit)
      .lean<INotification[]>(),
    Notification.countDocuments(filter),
  ]);

  return {
    items: notifications.map(toNotificationDTO),
    meta: buildMeta(total, query.page, query.limit),
  };
}

export function getUnreadCount(userId: string): Promise<number> {
  return Notification.countDocuments({ recipient: userId, isRead: false });
}

export async function markRead(userId: string, notificationId: string) {
  // Scoped to the owner: marking someone else's notification read is not possible to express.
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true },
  );

  // Already read, or not theirs — both are a no-op rather than an error.
  if (!notification) {
    const exists = await Notification.findOne({ _id: notificationId, recipient: userId }).lean();
    if (!exists) throw ApiError.notFound('Notification');
  }

  const unreadCount = await getUnreadCount(userId);
  // Keeps other open tabs' badges in step.
  emitToUser(userId, 'notification:read', { unreadCount });

  return { unreadCount };
}

export async function markAllRead(userId: string) {
  await Notification.updateMany(
    { recipient: userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );

  emitToUser(userId, 'notification:read', { unreadCount: 0 });
  return { unreadCount: 0 };
}

export async function removeNotification(userId: string, notificationId: string) {
  const result = await Notification.deleteOne({ _id: notificationId, recipient: userId });
  if (result.deletedCount === 0) throw ApiError.notFound('Notification');

  const unreadCount = await getUnreadCount(userId);
  emitToUser(userId, 'notification:read', { unreadCount });
  return { unreadCount };
}

/** Used by admin broadcasts and, later, digest jobs. */
export async function notifyRole(role: 'admin' | 'shelter', input: Omit<CreateNotificationInput, 'recipient'>) {
  const users = await User.find({ role, status: 'active', deletedAt: null }).select('_id').lean();
  await createNotifications(users.map((user) => ({ ...input, recipient: user._id })));
}
