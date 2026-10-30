'use strict';

const SIMULATE_ERROR_TRIGGER = '/simulate-error';

// Ordered: the first matching rule wins. Replies only describe what this
// prototype actually does and never invent business details.
const RULES = [
  {
    pattern: /\b(my account|my details|my data|balance|order|password|login|log in|personal)\b/i,
    reply:
      "I don't have access to customer accounts or personal information, and I can't look up or change any records. Please don't share personal details in this chat.",
  },
  {
    pattern: /\b(invest|investment|stocks?|shares?|mutual funds?|loan|tax|advice)\b/i,
    reply:
      "I can't provide financial or investment advice. I'm a demo assistant that can only answer a few general questions about this website prototype.",
  },
  {
    pattern: /\b(icet|mock tests?|practice tests?|exam|telangana|ap icet|ts icet|tg icet)\b/i,
    reply:
      'AP ICET and TG ICET practice tests are in the Mock Tests section. The current tests are samples with placeholder questions, and they are not affiliated with the official exam authorities.',
  },
  {
    pattern: /\b(person|human|talk|contact|phone|email|address|call|fees?|price|cost|admissions?|enrol|enroll)\b/i,
    reply:
      "I can't share contact details, fees or admission information in this demo. Please use the enquiry form on this website to reach the team.",
  },
  {
    // Programme names are published on the current public website; details are [PENDING] from the owner.
    pattern: /\b(programmes?|programs?|courses?|mba|pgdm|bba|b\.?com|fund accounting|investment banking)\b/i,
    reply:
      'Programmes listed on our website are PGDM / MBA, Advanced B.Com / BBA and Investment Banking & Fund Accounting. Detailed eligibility and duration will be published soon.',
  },
  {
    pattern: /\b(who are you|what are you|are you (a )?(bot|human|ai|real))\b/i,
    reply:
      "I'm an automated demo assistant with pre-written replies. I'm not a person, and I'm not connected to a live AI service yet.",
  },
  {
    pattern: /^(hi|hello|hey|namaste|good (morning|afternoon|evening))\b/i,
    reply:
      "Hello! I'm the MyPlanetFinance demo assistant. I can answer a few general questions about this website prototype.",
  },
];

const DEFAULT_REPLY =
  "Thanks for your message. I'm a demo assistant with pre-written replies, so I can't answer that yet. You can ask me about this website or the planned mock tests.";

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function pickReply(message) {
  const rule = RULES.find(({ pattern }) => pattern.test(message));
  return rule ? rule.reply : DEFAULT_REPLY;
}

/**
 * Keyword-based provider for local development and tests. Needs no
 * credentials and makes no network calls.
 */
function createMockProvider({ delayMs = 0, simulateErrors = false } = {}) {
  return {
    name: 'mock',
    async generateReply({ message, signal }) {
      if (delayMs > 0) await wait(delayMs, signal);
      if (simulateErrors && message.trim().toLowerCase() === SIMULATE_ERROR_TRIGGER) {
        throw new Error('Simulated provider failure');
      }
      return { text: pickReply(message) };
    },
  };
}

module.exports = { createMockProvider, pickReply, DEFAULT_REPLY, SIMULATE_ERROR_TRIGGER };
