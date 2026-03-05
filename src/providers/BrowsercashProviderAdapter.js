/**
 * @typedef {object} NormalizedBrowserSession
 * @property {string} id
 * @property {string} cdpUrl
 * @property {string} [servedBy]
 * @property {string} [viewerUrl]
 */

/**
 * @abstract
 */
export default class BrowserProviderAdapter {
	/**
	 * @returns {Promise<NormalizedBrowserSession>}
	 */
	async createSession() {
		throw new Error("createSession() must be implemented by provider adapters.");
	}

	/**
	 * @param {NormalizedBrowserSession} session
	 * @returns {Promise<void>}
	 */
	async stopSession(session) {
		throw new Error("stopSession() must be implemented by provider adapters.");
	}
}
