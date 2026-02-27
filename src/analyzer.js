import {existsSync} from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import BrowsercashSDK from "@browsercash/sdk";
import OpenAI from "openai";
import {chromium} from "playwright";
import "dotenv/config";

if (!process.env.NVIDIA_API_KEY) {
	console.error("Error: NVIDIA_API_KEY environment variable is not set.");
	process.exit(1);
}

if (!process.env.ZEN_API_KEY) {
	console.error("Error: ZEN_API_KEY environment variable is not set.");
	process.exit(1);
}

const bcClient = new BrowsercashSDK({
	apiKey: process.env.BROWSERCASH_API_KEY,
});

const openai = new OpenAI({
	apiKey: process.env.NVIDIA_API_KEY,
	baseURL: "https://integrate.api.nvidia.com/v1",
});

// https://build.nvidia.com/models
const visionModel = "qwen/qwen3.5-397b-a17b";

// Handle interrupts like Ctrl+C
process.on("SIGINT", async () => {
	console.log("\nReceived SIGINT. Cleaning up...");
	await cleanup();
	process.exit(0);
});

process.on("SIGTERM", async () => {
	console.log("\nReceived SIGTERM. Cleaning up...");
	await cleanup();
	process.exit(0);
});

const targetUrl = process.argv[2];
if (!targetUrl) {
	console.error("Usage: node src/app.js <url>");
	process.exit(1);
}

try {
	new URL(targetUrl);
} catch (err) {
	console.error("Invalid URL. Please provide a URL like https://example.com");
	process.exit(1);
}

let session;
let browser;

async function run() {
	console.log(`Analyzing: ${targetUrl}`);

	const initialDomain = getRootDomain(targetUrl).replace(/[^a-zA-Z0-9-]/g, "_");
	const initialDomainDir = path.join(process.cwd(), "reports", initialDomain);
	if (existsSync(initialDomainDir)) {
		console.log(`   Output directory "${initialDomainDir}" already exists. Skipping analysis.`);
		return;
	}

	console.log("1. Creating browser session...");

	try {
		session = await bcClient.browser.session.create();
		console.log(`   Session created! ID: ${truncate(session.sessionId)} (${session.servedBy})`);

		console.log("2. Connecting Playwright...");
		browser = await chromium.connectOverCDP(session.cdpUrl);
		const page = await browser.newPage();

		// Use a standard desktop viewport
		await page.setViewportSize({width: 1440, height: 900});

		console.log(`3. Navigating to ${targetUrl} ...`);
		await page.goto(targetUrl, {waitUntil: "networkidle", timeout: 45000});

		const actualUrl = page.url();
		const domain = getRootDomain(actualUrl).replace(/[^a-zA-Z0-9-]/g, "_");

		const domainDir = path.join(process.cwd(), "reports", domain);
		if (existsSync(domainDir)) {
			console.log(`   Output directory "${domainDir}" already exists. Skipping analysis.`);
			return;
		}

		console.log("   Taking screenshot & extracting page source...");
		const imageBuffer = await page.screenshot({fullPage: true});
		const imageBase64 = imageBuffer.toString("base64");
		const pageSource = await page.content();

		console.log("   Cleaning up browser session early...");
		await cleanup();

		const prompt = `Please analyze the landing page shown in the screenshot and the accompanying HTML source code. 
As an expert UI/UX specialist and conversion rate optimization professional, perform a comprehensive teardown based on proven startup landing page best practices.

Specifically evaluate the following criteria:
1. Clarity & Value Proposition: Is the headline crystal clear about what the product does without using vague slogans or buzzwords? 
2. Customer Focus: Is the copy written with the customer as the hero (focusing on their pain and your solution)? Does it pass the "so what" test?
3. Social Proof & Trust: Are there believable testimonials, recognizable client logos, or concrete verifiable claims to build trust?
4. Call to Action (CTA): Is there a prominent, recurring CTA? Does it avoid conflicting secondary CTAs and asking for too much too early?
5. Visual Design & Readability: Is the text legible? Are there distracting elements (like automatic carousels) that should be removed? Is the page properly structured?

Identify specific strengths, critical weaknesses, and provide concrete, actionable recommendations to improve conversion rates.`;

		console.log("4. Generating comprehensive analysis report...");
		const reportResponse = await fetchWithRetry(() =>
			openai.chat.completions.create({
				model: visionModel,
				messages: [
					{
						role: "system",
						content: "You are an expert web developer, UI/UX specialist, and conversion rate optimization professional.",
					},
					{
						role: "user",
						content: [
							{
								type: "text",
								text: `${prompt}\n\nHere is the raw HTML page source for your reference:\n\n\`\`\`html\n${pageSource}\n\`\`\`\n\nAnd along with the source, analyze the attached screenshot of the rendered page.`,
							},
							{
								type: "image_url",
								image_url: {url: `data:image/png;base64,${imageBase64}`},
							},
						],
					},
				],
			}),
		);

		const finalReportText = reportResponse.choices[0].message.content;

		// Save artifacts to the domain directory
		console.log("6. Saving artifacts...");

		await fs.mkdir(domainDir, {recursive: true});

		// 1. Save screenshot
		const screenshotPath = path.join(domainDir, `${domain}_screenshot.png`);
		await fs.writeFile(screenshotPath, imageBuffer);
		console.log(`   Saved screenshot to: "${screenshotPath}"`);

		// 2. Save page source
		const sourcePath = path.join(domainDir, `${domain}_source.html`);
		await fs.writeFile(sourcePath, pageSource, "utf-8");
		console.log(`   Saved page source to: "${sourcePath}"`);

		// 3. Save report
		const screenshotFileName = `${domain}_screenshot.png`;
		const finalReport = `![Screenshot of ${domain}](./${screenshotFileName})\n\n${finalReportText}`;
		const reportPath = path.join(domainDir, `${domain}_report.md`);
		await fs.writeFile(reportPath, finalReport, "utf-8");

		console.log(`\nSuccess! All artifacts saved in: "${domainDir}"`);
		console.log(`Final report written to: "${reportPath}"`);
	} catch (err) {
		console.error("An error occurred during task execution:", err);
	} finally {
		await cleanup();
	}
}

await run();

/**
 * Fetches data with retry logic for rate limiting.
 * @param {Function} apiCall - The API call function to execute.
 * @param {number} [maxRetries=5] - Maximum number of retries.
 * @returns {Promise<any>} - The result of the API call.
 */
async function fetchWithRetry(apiCall, maxRetries = 5) {
	for (let i = 0; i < maxRetries; i++) {
		try {
			return await apiCall();
		} catch (err) {
			if (err.status === 429 && i < maxRetries - 1) {
				const waitTime = 2 ** i * 5000;
				console.log(`   Rate limited! Retrying in ${waitTime / 1000} seconds...`);
				await new Promise((r) => setTimeout(r, waitTime));
			} else {
				throw err;
			}
		}
	}
}

/**
 * Cleans up resources by closing the browser and session.
 */
async function cleanup() {
	console.log("\nCleaning up...");
	if (browser) {
		process.stdout.write("\nCleaning up browser...");
		await browser.close().catch(() => {});
		browser = null;
	}

	if (session) {
		process.stdout.write(`\nStopping browser session ${truncate(session.sessionId)}...`);
		await bcClient.browser.session.stop({sessionId: session.sessionId}).catch(() => {});
		session = null;
	}
}

/**
 * Extracts the root domain from a URL.
 * @param {string} urlString - The URL string to extract the root domain from.
 * @returns {string} The root domain extracted from the URL.
 */
function getRootDomain(urlString) {
	const {hostname} = new URL(urlString);
	const parts = hostname.split(".");

	// Handle common cases (example.com, test.example.com)
	if (parts.length <= 2) {
		return hostname;
	}

	// Return last two parts (example.com)
	return parts.slice(-2).join(".");
}

/**
 * @param {string} string
 * @param {number} length
 * @returns {string}
 */
function truncate(string, length = 20) {
	return `${string.substring(0, length)}...`;
}
