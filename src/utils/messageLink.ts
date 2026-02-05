/**
 * Parsed result from a Telegram message link.
 */
export interface ParsedMessageLink {
  /** Chat ID: numeric for private channels, @username for public */
  chatId: number | string;
  /** Message ID within the chat */
  messageId: number;
}

/**
 * Parses a Telegram message URL and extracts chat ID and message ID.
 *
 * Supported formats:
 * - https://t.me/channel_username/12345 (public channel/group)
 * - https://t.me/c/1234567890/12345 (private channel, numeric ID)
 *
 * @param url - The message URL to parse
 * @returns Parsed link data, or null if URL format is invalid
 */
export function parseMessageLink(url: string): ParsedMessageLink | null {
  // Normalize: trim whitespace, handle both http and https
  const trimmed = url.trim();

  // Pattern 1: Public channel/group — https://t.me/username/123
  // Username rules: starts with letter/underscore, 5+ chars, alphanumeric + underscore
  const publicMatch = trimmed.match(
    /(?:https?:\/\/)?t\.me\/([a-zA-Z_][a-zA-Z0-9_]{4,})\/(\d+)/
  );
  if (publicMatch) {
    return {
      chatId: `@${publicMatch[1]}`,
      messageId: parseInt(publicMatch[2]!, 10),
    };
  }

  // Pattern 2: Private channel — https://t.me/c/1234567890/123
  // The URL contains the channel ID without the -100 prefix
  const privateMatch = trimmed.match(
    /(?:https?:\/\/)?t\.me\/c\/(\d+)\/(\d+)/
  );
  if (privateMatch) {
    // Private channel IDs in the API need -100 prefix
    // e.g., URL has 1234567890, API needs -1001234567890
    const rawId = privateMatch[1]!;
    const chatId = parseInt(`-100${rawId}`, 10);
    return {
      chatId,
      messageId: parseInt(privateMatch[2]!, 10),
    };
  }

  return null;
}
