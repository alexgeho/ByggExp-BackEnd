/**
 * Test stub for the ESM-only `puppeteer-core` package. Invoice PDF rendering is
 * not exercised by the isolation e2e tests, so `launch` simply throws if used.
 */
const puppeteer = {
  async launch(): Promise<never> {
    throw new Error('puppeteer-core is stubbed in tests');
  },
};

export default puppeteer;
