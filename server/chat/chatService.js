'use strict';

const { SYSTEM_PROMPT } = require('./systemPrompt');

const MAX_REPLY_LENGTH = 2000;
const REDACTED = '[redacted]';
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Ten or more digits, optionally separated by spaces or dashes (phone, Aadhaar, account numbers).
const LONG_NUMBER_PATTERN = /\+?\d(?:[\s-]?\d){9,}/g;

class ChatServiceError extends Error {
  constructor(code, status, publicMessage) {
    super(publicMessage);
    this.name = 'ChatServiceError';
    this.code = code;
    this.status = status;
    this.publicMessage = publicMessage;
  }
}

/** Strips obvious personal data so it is never forwarded to an AI provider. */
function redactPersonalData(text) {
  return text.replace(EMAIL_PATTERN, REDACTED).replace(LONG_NUMBER_PATTERN, REDACTED);
}

function createChatService({ provider, timeoutMs, logger = console }) {
  async function reply({ message, history }) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(
          new ChatServiceError('TIMEOUT', 504, 'The assistant took too long to respond. Please try again.'),
        );
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([
        provider.generateReply({
          message: redactPersonalData(message),
          history: history.map((turn) => ({ ...turn, content: redactPersonalData(turn.content) })),
          systemPrompt: SYSTEM_PROMPT,
          signal: controller.signal,
        }),
        timeout,
      ]);

      const text = typeof result?.text === 'string' ? result.text.trim() : '';
      if (!text) {
        throw new ChatServiceError('EMPTY_REPLY', 502, 'The assistant could not answer right now. Please try again.');
      }
      return { reply: text.slice(0, MAX_REPLY_LENGTH) };
    } catch (err) {
      if (err instanceof ChatServiceError) {
        logger.warn(`[chat] ${err.code}`);
        throw err;
      }
      // Log only the error type: never message content, provider responses or keys.
      logger.error(`[chat] provider error (${provider.name}): ${err?.name || 'Error'}`);
      throw new ChatServiceError('PROVIDER_ERROR', 502, 'The assistant is unavailable right now. Please try again later.');
    } finally {
      clearTimeout(timer);
    }
  }

  return { reply };
}

module.exports = { createChatService, ChatServiceError, redactPersonalData, MAX_REPLY_LENGTH };
