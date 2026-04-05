import Kernel from "@onkernel/sdk";
import * as constants from "../constants.js";
import BrowserProviderAdapter from "./BrowserProviderAdapter.js";

export default class KernelProviderAdapter extends BrowserProviderAdapter {
	constructor() {
		super();

		this.client = new Kernel({
			apiKey: process.env.KERNEL_API_KEY,
		});
	}

	async createSession() {
		const session = await this.client.browsers.create({
			timeout_seconds: constants.BROWSER_TIMEOUT_SECONDS,
		});

		return {
			id: session.session_id,
			cdpUrl: session.cdp_ws_url,
			servedBy: "kernel.sh",
			viewerUrl: session.browser_live_view_url,
		};
	}

	async stopSession(session) {
		await this.client.browsers.deleteByID(session.id);
	}
}
