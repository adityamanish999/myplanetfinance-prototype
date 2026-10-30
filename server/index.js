'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadConfig } = require('./config');
const { createApp } = require('./app');
const { createChatProvider } = require('./chat/providers');
const { createChatService } = require('./chat/chatService');
const { createRateLimiter } = require('./chat/rateLimiter');
const { loadSiteContent } = require('./content/siteContent');
const { createJsonStore } = require('./storage/jsonStore');
const { createTestRepository } = require('./mockTests/testRepository');
const { createAttemptService } = require('./mockTests/attemptService');
const { createAdminAuth } = require('./admin/adminAuth');
const { createContentRepository, initialContent } = require('./content/contentRepository');
const { createMediaLibrary } = require('./content/mediaLibrary');

const SEED_FILE = path.join(__dirname, '..', 'data', 'seed', 'mock-tests.json');
const CONTENT_SEED_FILE = path.join(__dirname, '..', 'data', 'seed', 'site-content.json');
const MINUTE = 60 * 1000;

const config = loadConfig();
const provider = createChatProvider(config.chat);
const siteContent = loadSiteContent();

// First run copies the placeholder sample tests; later runs keep admin edits.
const testStore = createJsonStore(path.join(config.dataDir, 'mock-tests.json'), {
  initial: () => JSON.parse(fs.readFileSync(SEED_FILE, 'utf8')),
});
const attemptStore = createJsonStore(path.join(config.dataDir, 'attempts.json'), { initial: { version: 1, attempts: {} } });
const repository = createTestRepository(testStore);
const auth = createAdminAuth(config.admin);

// Website content: first run copies the seed text plus any social URLs from content/site.json.
const media = createMediaLibrary({
  store: createJsonStore(path.join(config.dataDir, 'media.json'), { initial: { version: 1, items: [] } }),
  dir: path.join(config.dataDir, 'uploads'),
});
const contentStore = createJsonStore(path.join(config.dataDir, 'site-content.json'), {
  initial: () => {
    const seed = JSON.parse(fs.readFileSync(CONTENT_SEED_FILE, 'utf8'));
    for (const { platform, url } of siteContent.socialLinks) seed.social[platform] = url;
    return initialContent(seed);
  },
});
const contentRepository = createContentRepository(contentStore, { mediaExists: media.exists });

const app = createApp({
  chatService: createChatService({ provider, timeoutMs: config.chat.timeoutMs }),
  rateLimiter: createRateLimiter(config.chat.rateLimit),
  siteContent,
  content: { repository: contentRepository, media },
  mockTests: {
    repository,
    attemptService: createAttemptService({ store: attemptStore, repository }),
    startLimiter: createRateLimiter({ windowMs: 60 * MINUTE, max: 30 }),
    writeLimiter: createRateLimiter({ windowMs: 10 * MINUTE, max: 1200 }),
  },
  admin: {
    auth,
    repository,
    loginLimiter: createRateLimiter({ windowMs: 15 * MINUTE, max: 10 }),
  },
});

app.listen(config.port, config.host, () => {
  const published = contentRepository.getPublished().social;
  const social = Object.keys(published).filter((p) => published[p]).join(', ') || 'none configured';
  console.log(`MyPlanetFinance prototype running at http://${config.host}:${config.port}`);
  console.log(`  chat provider: ${provider.name} · social links: ${social} · admin: ${auth.enabled ? 'enabled' : 'not configured'}`);
});
