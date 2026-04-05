import BrowsercashSDK from "@browsercash/sdk";
import * as constants from "../constants.js";
import BrowserProviderAdapter from "./BrowserProviderAdapter.js";

export default class BrowsercashProviderAdapter extends BrowserProviderAdapter {
	constructor() {
		super();

		this.client = new BrowsercashSDK({
			apiKey: process.env.BROWSERCASH_API_KEY,
		});
	}

	async createSession() {
		const session = await this.client.browser.session.create({
			type: "hosted",
			duration: Math.max(60, constants.BROWSER_TIMEOUT_SECONDS),
		});

		return {
			id: session.sessionId,
			cdpUrl: session.cdpUrl,
			servedBy: session.servedBy,
			viewerUrl: `https://dash.browser.cash/cdp_tabs?ws=${encodeURIComponent(session.cdpUrl)}&theme=light`,
		};
	}

	async stopSession(session) {
		await this.client.browser.session.stop({sessionId: session.id});
	}
}
