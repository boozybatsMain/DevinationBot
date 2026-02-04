import { redis } from "../storage/redis.js";
import type { GroupInfo } from "../types/index.js";

const GROUP_KEY_PREFIX = "user_groups:";

/**
 * Saves a group association for a user (when bot is added to a group).
 * Deduplicates by chatId.
 */
export async function addGroupForUser(
  userId: number,
  group: GroupInfo,
): Promise<void> {
  const key = `${GROUP_KEY_PREFIX}${userId}`;
  const existing = await getGroupsForUser(userId);
  const filtered = existing.filter((g) => g.chatId !== group.chatId);
  filtered.push(group);
  await redis.set(key, JSON.stringify(filtered));
}

/**
 * Removes a group association for a user (when bot is removed from a group).
 */
export async function removeGroupForUser(
  userId: number,
  chatId: number,
): Promise<void> {
  const key = `${GROUP_KEY_PREFIX}${userId}`;
  const existing = await getGroupsForUser(userId);
  const filtered = existing.filter((g) => g.chatId !== chatId);
  if (filtered.length > 0) {
    await redis.set(key, JSON.stringify(filtered));
  } else {
    await redis.del(key);
  }
}

/**
 * Returns all groups where a user has added this bot as admin.
 */
export async function getGroupsForUser(userId: number): Promise<GroupInfo[]> {
  const key = `${GROUP_KEY_PREFIX}${userId}`;
  const data = await redis.get<string>(key);
  if (!data) return [];
  try {
    return JSON.parse(data) as GroupInfo[];
  } catch {
    return [];
  }
}
