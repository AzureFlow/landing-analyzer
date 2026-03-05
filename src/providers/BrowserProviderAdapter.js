import BrowsercashSDK from "@browsercash/sdk";
import BrowserProviderAdapter from "./BrowsercashProviderAdapter.js";

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
