'use strict';

const { createMockProvider } = require('./mockProvider');

/**
 * Chat provider contract. Every provider is an object of the form:
 *
 *   {
 *     name: string,
 *     generateReply({ message, history, systemPrompt, signal }): Promise<{ text: string }>
 *   }
 *
 *   message      - validated, sanitised user message (string)
 *   history      - prior turns: Array<{ role: 'user' | 'assistant', content: string }>
 *   systemPrompt - policy instructions from ../systemPrompt.js
 *   signal       - AbortSignal; aborted when the chat service times out
 *
 * Adding a live provider (only after the provider is approved — see
 * docs/technical-architecture.md, D6):
 *   1. Create providers/<name>Provider.js implementing the contract above.
 *   2. Read its API key from process.env inside that module (server-side only)
 *      and fail fast if it is missing. Never log or return the key.
 *   3. Add a `case '<name>'` below and set CHAT_PROVIDER=<name> in .env.
 *   4. Throw on any upstream error; the chat service converts errors into
 *      safe, generic messages for the browser.
 */
function createChatProvider(chatConfig) {
  switch (chatConfig.provider) {
    case 'mock':
      return createMockProvider(chatConfig.mock);
    default:
      throw new Error(
        `Chat provider "${chatConfig.provider}" is not configured. Only "mock" is available until an AI provider is approved.`,
      );
  }
}

module.exports = { createChatProvider };
