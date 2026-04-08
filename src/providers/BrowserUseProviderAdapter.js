import {BrowserUse} from "browser-use-sdk/v3";
import BrowserProviderAdapter from "./BrowserProviderAdapter.js";

export default class BrowserUseProviderAdapter extends BrowserProviderAdapter {
	constructor() {
		super();

		this.client = new BrowserUse({
			apiKey: process.env.BROWSER_USE_API_KEY,
		});
	}

	async createSession() {
		const session = await this.client.browsers.create();

		return {
			id: session.id,
			cdpUrl: session.cdpUrl,
			servedBy: "browser-use.com",
			viewerUrl: session.liveUrl,
		};
	}

	async stopSession(session) {
		await this.client.browsers.stop(session.id);
	}
}
