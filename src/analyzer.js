import {existsSync} from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import BrowsercashSDK from "@browsercash/sdk";
import OpenAI from "openai";
import {chromium} from "playwright-core";
import "dotenv/config";
import chalk from "chalk";
import {Command} from "commander";
import inquirer from "inquirer";
import ora from "ora";

if (!process.env.NVIDIA_API_KEY) {
	console.error(chalk.red("Error: NVIDIA_API_KEY environment variable is not set."));
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

const spinner = ora({
	spinner: "simpleDotsScrolling",
	color: "cyan",
	interval: 90,
});

// Handle interrupts like Ctrl+C
process.on("SIGINT", async () => {
	if (spinner.isSpinning) spinner.stop();
	console.log(chalk.yellow("\nReceived SIGINT. Cleaning up..."));
	await cleanup();
	process.exit(0);
});

process.on("SIGTERM", async () => {
	if (spinner.isSpinning) spinner.stop();
	console.log(chalk.yellow("\nReceived SIGTERM. Cleaning up..."));
	await cleanup();
	process.exit(0);
});

const program = new Command().name("analyzer").description("Analyze landing pages using AI directly from the CLI.").argument("[url]", "The URL of the landing page to analyze").parse(process.argv);

let targetUrl = program.args[0];

if (!targetUrl) {
	// noinspection JSUnusedGlobalSymbols
	const answers = await inquirer.prompt([
		{
			type: "input",
			name: "url",
			message: chalk.cyan("What is the URL of the landing page you want to analyze?"),
			validate: (input) => {
				try {
					new URL(input);
					return true;
				} catch (err) {
					return "Please enter a valid URL (e.g., https://example.com)";
				}
			},
		},
	]);
	// noinspection JSUnresolvedReference
	targetUrl = answers.url;
} else {
	try {
		new URL(targetUrl);
	} catch (err) {
		console.error(chalk.red("Invalid URL. Please provide a URL like https://example.com"));
		process.exit(1);
	}
}

let session;
let browser;

async function run() {
	console.log(chalk.bold.green(`\n🚀 Analyzing: ${targetUrl}\n`));

	const initialDomain = getRootDomain(targetUrl).replace(/[^a-zA-Z0-9-]/g, "_");
	const initialDomainDir = path.join(process.cwd(), "reports", initialDomain);
	if (existsSync(initialDomainDir)) {
		console.log(chalk.yellow(`   Output directory "${initialDomainDir}" already exists. Skipping analysis.`));
		return;
	}

	spinner.start("Creating browser session...");

	try {
		session = await bcClient.browser.session.create({
			type: "hosted",
		});
		const viewerUrl = `https://dash.browser.cash/cdp_tabs?ws=${encodeURIComponent(session.cdpUrl)}&theme=light`;

		spinner.succeed(`Session created! ID: ${chalk.cyan(truncate(session.sessionId.toUpperCase(), 12))} (${chalk.gray(session.servedBy)})`);
		console.log(`View your session live: ${viewerUrl}`);

		spinner.start("Connecting Playwright...");
		browser = await chromium.connectOverCDP(session.cdpUrl);
		const page = await browser.newPage();

		// Use a standard desktop viewport
		const pageViewport = {width: 1440, height: 900};
		await page.setViewportSize(pageViewport);

		spinner.text = `Navigating to ${chalk.green(targetUrl)} ...`;
		await page.goto(targetUrl, {waitUntil: "networkidle", timeout: 45000});

		const actualUrl = page.url();
		const domain = getRootDomain(actualUrl).replace(/[^a-zA-Z0-9-]/g, "_");

		const domainDir = path.join(process.cwd(), "reports", domain);
		if (existsSync(domainDir)) {
			spinner.warn(`Output directory "${chalk.yellow(domainDir)}" already exists. Skipping analysis.`);
			return;
		}

		spinner.text = "Scrolling through page...";
		await autoScroll(page);

		spinner.text = "Taking screenshot & extracting page source...";
		const imageBuffer = await page.screenshot({
			fullPage: true,
			clip: {
				x: 0,
				y: 0,
				width: pageViewport.width,
				height: await page.evaluate(() => document.documentElement.scrollHeight),
			},
		});
		const imageBase64 = imageBuffer.toString("base64");
		const pageSource = await page.content();
		const pageText = await page.innerText("body");

		spinner.text = "Cleaning up browser session early...";
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

		spinner.start("Generating comprehensive analysis report...");
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
								text: `${prompt}\n\nBelow is the extracted text content from the page:\n\n---\n${pageText}\n---\n\nAlso analyze the attached screenshot of the rendered page.`,
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
		spinner.succeed("Report generated successfully!");

		// Save artifacts to the domain directory
		spinner.start("Saving artifacts...");

		await fs.mkdir(domainDir, {recursive: true});

		// 1. Save screenshot
		const screenshotPath = path.join(domainDir, `${domain}_screenshot.png`);
		await fs.writeFile(screenshotPath, imageBuffer);
		spinner.info(`Saved screenshot to: ${chalk.green(screenshotPath)}`);

		// 2. Save page source
		const sourcePath = path.join(domainDir, `${domain}_source.html`);
		await fs.writeFile(sourcePath, pageSource, "utf-8");
		spinner.info(`Saved page source to: ${chalk.green(sourcePath)}`);

		// 3. Save report
		const screenshotFileName = `${domain}_screenshot.png`;
		const finalReport = `![Screenshot of ${domain}](./${screenshotFileName})\n\n${finalReportText}`;
		const reportPath = path.join(domainDir, `${domain}_report.md`);
		await fs.writeFile(reportPath, finalReport, "utf-8");

		spinner.succeed(chalk.bold.green(`Success! All artifacts saved in: ${domainDir}`));
		console.log(chalk.cyan(`\nFinal report written to: ${chalk.underline(reportPath)}\n`));
	} catch (err) {
		if (spinner.isSpinning) spinner.fail("An error occurred during task execution.");
		console.error(chalk.red(err));
	} finally {
		await cleanup();
	}
}

await run();

/**
 * Scrolls through the entire page to trigger scroll-based animations,
 * lazy-loaded images, and intersection observer callbacks, then scrolls
 * back to the top and waits for everything to settle.
 *
 * Works alright for most sites.
 *
 * @param {import("playwright-core").Page} page
 */
async function autoScroll(page) {
	await page.evaluate(async () => {
		const scrollHeight = document.documentElement.scrollHeight;
		const viewportHeight = window.innerHeight;
		const step = Math.floor(viewportHeight / 2);

		for (let y = 0; y < scrollHeight; y += step) {
			window.scrollTo(0, y);
			await new Promise((r) => setTimeout(r, 150));
		}

		// Scroll to the bottom
		window.scrollTo(0, scrollHeight);
		await new Promise((r) => setTimeout(r, 300));

		// Scroll to top
		window.scrollTo(0, 0);
		await new Promise((r) => setTimeout(r, 500));
	});
}

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
				spinner.warn(chalk.yellow(`Rate limited! Retrying in ${waitTime / 1000} seconds...`)).start("Generating comprehensive analysis report (this may take awhile)");
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
	let neededCleanup = false;

	if (browser || session) {
		neededCleanup = true;
		if (!spinner.isSpinning) {
			spinner.start("Cleaning up...");
		}
	}

	if (browser) {
		spinner.text = "Cleaning up browser...";
		await browser.close().catch(() => {});
		browser = null;
	}

	if (session) {
		spinner.text = `Stopping browser session ${truncate(session.sessionId.toUpperCase(), 12)}...`;
		await bcClient.browser.session.stop({sessionId: session.sessionId}).catch(() => {});
		session = null;
	}

	if (neededCleanup) {
		spinner.succeed("Cleanup complete.");
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
