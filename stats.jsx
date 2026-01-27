import satori from "satori";
import { writeFileSync, readFileSync } from "fs";
import React from "react";
import { createHighlighter } from "shiki";
import "dotenv/config";
import { readFile } from "fs/promises";

// Load Victor Mono TTF font
const victorMonoData = readFileSync("victor-mono-v5-latin-regular.ttf");

// Shell theme and variables
const BG = "#140913";
const FG = "#fcfdfc";
const GOLDEN = "#ffc430";
const PINK = "#f133bd";
const HOTPINK = "#FF5C87";
const GRAY = "#8b8b8b";

const banner = `                888
                888    precision beyond pixels.
                888
888d888 .d88b.  888888 888d888 .d88b.  88888b.   8888b.  888  888
888P"  d8P  Y8b 888    888P"  d88""88b 888 "88b     "88b 888  888
888    88888888 888    888    888  888 888  888 .d888888 Y88  88P
888    Y8b.     Y88b.  888    Y88..88P 888  888 888  888  Y8bd8P
888     "Y8888   "Y888 888     "Y88P"  888  888 "Y888888   Y88P


Just remember, what happens on earth, stays on earth!
All commits are signed and verified since 2022-03-12. Question unverified commits.
`;

const Prompt = () => (
	<>
		<span style={{ color: GOLDEN }}>pranav</span>
		<span>@</span>
		<span style={{ color: PINK }}>karawale</span>
		<span style={{ color: GRAY }}>:</span>
		<span style={{ color: HOTPINK }}>~</span>
		<span>$ </span>
	</>
);

const birthDate = new Date("2005-01-29T00:00:00Z");
const now = new Date();

let uptimeYears = now.getFullYear() - birthDate.getFullYear();
let uptimeMonths = now.getMonth() - birthDate.getMonth();
let uptimeDays = now.getDate() - birthDate.getDate();

if (uptimeDays < 0) {
	uptimeMonths--;
	const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
	uptimeDays += prevMonth.getDate();
}
if (uptimeMonths < 0) {
	uptimeYears--;
	uptimeMonths += 12;
}

const tech = await readFile("./data/tech.json", { encoding: "utf-8" });
const interests = await readFile("./data/interests.json", {
	encoding: "utf-8",
});
const owner = "retronav";
const yearStart = new Date(new Date().getFullYear(), 0, 1);
const wakapiUrl =
	"https://wakapi.karawale.in/api/compat/wakatime/v1/users/pranav/stats";

const highlighter = await createHighlighter({
	langs: ["json"],
	themes: ["catppuccin-mocha"],
});

// Fetch coding stats from Wakapi
async function getWakapiStats() {
	const formatDuration = (seconds) => {
		if (!seconds) return "0h 0m";
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		return `${h}h ${m}m`;
	};

	try {
		const [dayResp, weekResp, monthResp] = await Promise.all([
			fetch(`${wakapiUrl}/today`),
			fetch(`${wakapiUrl}/last_7_days`),
			fetch(`${wakapiUrl}/last_30_days`),
		]);

		const [dayData, weekData, monthData] = await Promise.all([
			dayResp.json(),
			weekResp.json(),
			monthResp.json(),
		]);

		return {
			day: formatDuration(dayData?.data?.total_seconds || 0),
			week: formatDuration(weekData?.data?.total_seconds || 0),
			month: formatDuration(monthData?.data?.total_seconds || 0),
		};
	} catch (e) {
		console.error("Wakapi fetch failed", e);
		return { day: "0h 0m", week: "0h 0m", month: "0h 0m" };
	}
}

// GitHub stats: stars across owned repos + yearly contributions (commits/PRs/issues)
async function getGithubStats() {
	const token = process.env.GITHUB_TOKEN;
	if (!token) {
		return {
			year: new Date().getFullYear(),
			stars: 0,
			commits: 0,
			prs: 0,
			issues: 0,
		};
	}

	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const year = new Date().getFullYear();
	const toDate = new Date().toISOString();

	const query = `
		query($owner: String!, $from: DateTime!, $to: DateTime!, $cursor: String) {
			user(login: $owner) {
				contributionsCollection(from: $from, to: $to) {
					totalCommitContributions
					totalPullRequestContributions
					totalIssueContributions
				}
				repositories(first: 100, after: $cursor, ownerAffiliations: OWNER, orderBy: {field: UPDATED_AT, direction: DESC}) {
					nodes {
						stargazerCount
					}
					pageInfo {
						hasNextPage
						endCursor
					}
				}
			}
		}
	`;

	try {
		let cursor = null;
		let stars = 0;
		let contributions;

		while (true) {
			let data;
			for (let attempt = 1; attempt <= 3; attempt++) {
				const response = await fetch("https://api.github.com/graphql", {
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
						"User-Agent": "retronav-stats",
						Accept: "application/vnd.github+json",
					},
					body: JSON.stringify({
						query,
						variables: {
							owner,
							from: yearStart.toISOString(),
							to: toDate,
							cursor,
						},
					}),
				});
				if (!response.ok) {
					const text = await response.text();
					if (attempt === 3) {
						throw new Error(`GitHub GraphQL error ${response.status}: ${text}`);
					}
					await sleep(500 * attempt);
					continue;
				}
				data = await response.json();
				if (data.errors) {
					if (attempt === 3) {
						throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
					}
					await sleep(500 * attempt);
					continue;
				}
				break;
			}

			const user = data?.data?.user;
			if (!user) break;
			if (!contributions) {
				contributions = user.contributionsCollection;
			}

			const repos = user?.repositories?.nodes || [];
			for (const repo of repos) {
				stars += repo?.stargazerCount || 0;
			}

			const pageInfo = user?.repositories?.pageInfo;
			if (!pageInfo?.hasNextPage) break;
			cursor = pageInfo.endCursor;

			// Be nice to the API if you have a lot of repos
			await sleep(150);
		}

		return {
			year,
			stars,
			commits: contributions?.totalCommitContributions || 0,
			prs: contributions?.totalPullRequestContributions || 0,
			issues: contributions?.totalIssueContributions || 0,
		};
	} catch (e) {
		console.error("GitHub stats fetch failed", e);
		return {
			year: new Date().getFullYear(),
			stars: 0,
			commits: 0,
			prs: 0,
			issues: 0,
		};
	}
}

const renderJsonStyled = (value) => {
	/// Get syntax-highlighted tokens
	const tokens = highlighter.codeToTokens(value, {
		lang: "json",
		theme: "catppuccin-mocha",
	});

	// Convert tokens to React elements
	return tokens.tokens.map((line, lineIndex) => (
		<div key={lineIndex} style={{ display: "flex" }}>
			{line.map((token, tokenIndex) => (
				<span key={tokenIndex} style={{ color: token.color }}>
					{token.content || " "}
				</span>
			))}
		</div>
	));
};

const github = await getGithubStats();
const stats = await getWakapiStats();

const svg = await satori(
	<div
		style={{
			color: FG,
			background: BG,
			display: "flex",
			flexDirection: "column",
			height: "100%",
			width: "100%",
		}}
	>
		<div
			style={{
				display: "flex",
				margin: "1rem 2rem",
			}}
		>
			<img
				height={48}
				width={48}
				src="https://karawale.in/logo.png"
				alt="My logo"
			/>
		</div>
		<pre
			style={{
				color: FG,
				margin: "0 2rem",
				fontFamily: "Victor Mono",
			}}
		>
			<code
				style={{
					fontFamily: "Victor Mono",
					fontSize: "12px",
					display: "flex",
					flexDirection: "column",
				}}
			>
				<span style={{ color: GOLDEN }}>{banner}</span>
				<p>
					<span>{`Last login: ${now.toString()}`}</span>
				</p>
				<p style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
					<span>
						<Prompt />
						<span>uptime -p</span>
					</span>
					<span>
						up {uptimeYears} years, {uptimeMonths} months, {uptimeDays} days
					</span>
				</p>
				<p style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
					<span>
						<Prompt />
						<span>ls</span>
					</span>
					<span>{"tech  interests  github  coding  contact"}</span>
				</p>
				<p style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
					<span>
						<Prompt />
						<span>cat ./tech | jq</span>
					</span>
					<div style={{ display: "flex", flexDirection: "column", whiteSpace: "pre" }}>{renderJsonStyled(tech)}</div>
				</p>
				<p style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
					<span>
						<Prompt />
						<span>cat ./interests | jq</span>
					</span>
					<div style={{ display: "flex", flexDirection: "column", whiteSpace: "pre" }}>{renderJsonStyled(interests)}</div>
				</p>
				<p style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
					<span>
						<Prompt />
						<span>cat ./github</span>
					</span>
					<span>
						<span>{github.year} github : </span>
						<span>{"stars: "}</span>
						<span style={{ color: GOLDEN }}>{github.stars}</span>
						<span>{" | commits: "}</span>
						<span style={{ color: HOTPINK }}>{github.commits}</span>
						<span>{" | prs: "}</span>
						<span style={{ color: HOTPINK }}>{github.prs}</span>
						<span>{" | issues: "}</span>
						<span style={{ color: HOTPINK }}>{github.issues}</span>
					</span>
				</p>
				<p style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
					<span>
						<Prompt />
						<span>cat ./coding</span>
					</span>
					<span>
						<span>{"day: "}</span>
						<span style={{ color: HOTPINK }}>{stats.day}</span>
						<span>{" | week: "}</span>
						<span style={{ color: HOTPINK }}>{stats.week}</span>
						<span>{" | month: "}</span>
						<span style={{ color: HOTPINK }}>{stats.month}</span>
					</span>
				</p>
				<p style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
					<span>
						<Prompt />
						<span>cat ./contact</span>
					</span>
					<span>
						<span>
							Email : {/* Worst line of code I've written recently */}
							<span style={{ color: GOLDEN }}>
								{atob("cHJhbmF2QGthcmF3YWxlLmlu")}
								{"  "}
							</span>
						</span>
						<span>
							Website :{" "}
							<span style={{ color: GOLDEN }}>
								<u>https://karawale.in</u>
							</span>
						</span>
					</span>
				</p>
			</code>
		</pre>
	</div>,
	{
		width: 1000,
		height: 800,
		fonts: [
			{
				name: "Victor Mono",
				data: victorMonoData,
				weight: 400,
				style: "normal",
			},
		],
	},
);

// Write SVG to file
writeFileSync("readme.svg", svg);
console.log("SVG generated at readme.svg");
