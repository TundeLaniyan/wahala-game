/** `npm run check:config`: validates the environment and prints every problem. Exit 1 on any. Never prints a secret value. */
import { loadConfig, validateConfig } from '../config';

const c = loadConfig();
const problems = validateConfig(c);
const mask = (s: string): string => (s ? `set (${s.length} chars)` : 'not set');
console.log(
  JSON.stringify(
    {
      env: c.env,
      database: c.databaseUrl === 'memory' ? 'memory' : 'postgres url set',
      origins: c.allowedOrigins,
      providers: {
        google: c.googleClientIds.length > 0,
        apple: c.appleClientIds.length > 0,
        mock: c.mockIdentityProvider,
      },
      matchServerSecret: mask(c.matchServerSecret),
      adminToken: mask(c.adminToken),
      handoffKey: c.handoffPrivateKeyPem ? 'set' : 'not set',
      devOnly: { textChat: c.devTextChat, mockCheckout: c.mockCheckout },
    },
    null,
    2,
  ),
);
if (problems.length > 0) {
  for (const p of problems) console.error(`PROBLEM: ${p}`);
  process.exit(1);
}
console.log('configuration is valid');
