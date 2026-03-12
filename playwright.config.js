export default {
  testDir: './tests-e2e',
  timeout: 120000,
  use: {
    headless: true,
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  },
};
