import type { Api } from "grammy";
import { redis } from "../storage/redis.js";
import type { GroupInfo } from "../types/index.js";

const GROUP_KEY_PREFIX = "user_groups:";

/**
 * Saves a group/channel association for a user (when bot is added to a group or channel).
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
 * Removes a group/channel association for a user (when bot is removed from a group or channel).
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
 * Returns all groups/channels where a user has added this bot as admin.
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

/**
 * Returns verified groups/channels for a user. Checks that the bot is still a member
 * of each chat and removes stale entries (e.g. groups upgraded to supergroups
 * get a new chat ID, leaving orphaned entries).
 */
export async function getVerifiedGroupsForUser(
  userId: number,
  api: Api,
  botId: number,
): Promise<GroupInfo[]> {
  const groups = await getGroupsForUser(userId);
  if (groups.length === 0) return [];

  const verified: GroupInfo[] = [];

  for (const group of groups) {
    try {
      const member = await api.getChatMember(group.chatId, botId);
      if (member.status === "administrator" || member.status === "member" || member.status === "creator") {
        // Also refresh the title while we're at it
        try {
          const chat = await api.getChat(group.chatId);
          if ("title" in chat && chat.title) {
            group.title = chat.title;
          }
        } catch {
          // Title refresh failed, keep existing title
        }
        verified.push(group);
      }
    } catch {
      // Bot is not in this group anymore, skip it
    }
  }

  // Persist cleaned-up list
  if (verified.length !== groups.length) {
    const key = `${GROUP_KEY_PREFIX}${userId}`;
    if (verified.length > 0) {
      await redis.set(key, JSON.stringify(verified));
    } else {
      await redis.del(key);
    }
  }

  return verified;
}
