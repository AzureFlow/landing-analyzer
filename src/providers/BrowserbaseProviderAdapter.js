import Browserbase from "@browserbasehq/sdk";
import BrowserProviderAdapter from "./BrowsercashProviderAdapter.js";

export default class BrowserbaseProviderAdapter extends BrowserProviderAdapter {
	constructor() {
		super();

		this.client = new Browserbase({
			apiKey: process.env.BROWSERBASE_API_KEY,
		});
	}

	async createSession() {
		const session = await this.client.sessions.create({
			projectId: process.env.BROWSERBASE_PROJECT_ID ?? undefined,
			browserSettings: {
				blockAds: true,
				recordSession: false,
			},
		});

		let viewerUrl = `https://browserbase.com/sessions/${session.id}`;
		try {
			const debugUrls = await this.client.sessions.debug(session.id);
			if (debugUrls?.debuggerUrl) {
				viewerUrl = debugUrls.debuggerUrl;
			}
		} catch {
			// Dashboard link still works for replay/inspect
		}

		return {
			id: session.id,
			cdpUrl: session.connectUrl,
			servedBy: "browserbase.com",
			viewerUrl,
		};
	}

	async stopSession(session) {
		await this.client.sessions.update(session.id, {status: "REQUEST_RELEASE"});
	}
}
