# Landing Page Analyzer

An automated tool to evaluate and optimize landing page performance, SEO, and conversion potential.

## ⚙️ Installation

```bash
cp .env.example .env
pnpm install
```

Required environment variables:

- [`NVIDIA_API_KEY`](https://build.nvidia.com/models) (required)
- [`BROWSERCASH_API_KEY`](https://browser.cash/) (if using `browsercash` provider)
- [`KERNEL_API_KEY`](https://www.kernel.sh/) (if using `kernel` provider)
- [`BROWSERBASE_API_KEY`](https://www.browserbase.com/) (if using `browserbase` provider; optional `BROWSERBASE_PROJECT_ID` from the [dashboard](https://www.browserbase.com/sessions))

## 🔨 Usage

```bash
pnpm start -- https://example.com

pnpm start -- --provider kernel https://example.com
```

## 📊 Output

Artifacts are saved under `reports/<domain>/`:

```
reports/
└── example_com/
	├── example_com_screenshot.png      # Full-page screenshot
	├── example_com_source.html         # HTML source code
	└── example_com_report.md           # AI-generated analysis report
```

## 📝 License

MIT - See [LICENSE](LICENSE) file for more details.
