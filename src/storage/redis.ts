import { lazySession } from "grammy";
import { RedisAdapter } from "@grammyjs/storage-redis";
import { Redis } from "@upstash/redis";
import type { SessionData, MyContext } from "../types/index.js";
import { createDefaultSession } from "../types/index.js";
import { requireEnv } from "../utils/env.js";

/** Shared Upstash Redis client (HTTP-based, serverless-safe) */
export const redis = new Redis({
  url: requireEnv("UPSTASH_REDIS_REST_URL"),
  token: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
  automaticDeserialization: false, // RedisAdapter does its own JSON.parse
});

const storage = new RedisAdapter<SessionData>({
  instance: redis,
  ttl: 86_400, // 24 hours TTL — keeps drafts alive between sessions
});

/**
 * Creates lazy session middleware backed by Upstash Redis.
 * Lazy sessions only read from Redis when ctx.session is accessed.
 */
export function createRedisSession() {
  return lazySession<SessionData, MyContext>({
    initial: createDefaultSession,
    storage,
  });
}
