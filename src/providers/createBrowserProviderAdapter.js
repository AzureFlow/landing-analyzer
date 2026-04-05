import BrowserbaseProviderAdapter from "./BrowserbaseProviderAdapter.js";
import BrowsercashProviderAdapter from "./BrowsercashProviderAdapter.js";
import KernelProviderAdapter from "./KernelProviderAdapter.js";

/**
 * @param {string} provider
 * @returns {BrowserProviderAdapter}
 */
function createBrowserProviderAdapter(provider) {
	switch (provider.toUpperCase()) {
		case "BROWSERCASH":
			if (!process.env.BROWSERCASH_API_KEY) {
				throw new Error("BROWSERCASH_API_KEY environment variable is not set.");
			}

			return new BrowsercashProviderAdapter();
		case "KERNEL":
			if (!process.env.KERNEL_API_KEY) {
				throw new Error("KERNEL_API_KEY environment variable is not set.");
			}

			return new KernelProviderAdapter();
		case "BROWSERBASE":
			if (!process.env.BROWSERBASE_API_KEY) {
				throw new Error("BROWSERBASE_API_KEY environment variable is not set.");
			}

			return new BrowserbaseProviderAdapter();
		default:
			throw new Error(`Unsupported browser provider: ${provider}. Use one of: BROWSERCASH, KERNEL, BROWSERBASE.`);
	}
}

export default createBrowserProviderAdapter;
