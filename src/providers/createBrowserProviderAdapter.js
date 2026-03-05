import BrowsercashProviderAdapter from "./BrowserProviderAdapter.js";
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
		default:
			throw new Error(`Unsupported browser provider: ${provider}. Use one of: BROWSERCASH, KERNEL.`);
	}
}

export default createBrowserProviderAdapter;
