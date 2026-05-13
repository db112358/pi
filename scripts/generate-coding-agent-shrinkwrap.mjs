#!/usr/bin/env node

import { execFileSync } from "child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const codingAgentDir = join(repoRoot, "packages/coding-agent");
const rootLockfilePath = join(repoRoot, "package-lock.json");
const shrinkwrapPath = join(codingAgentDir, "npm-shrinkwrap.json");

const INTERNAL_WORKSPACES = new Map([
	["@earendil-works/pi-agent-core", "packages/agent"],
	["@earendil-works/pi-ai", "packages/ai"],
	["@earendil-works/pi-tui", "packages/tui"],
]);

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

for (const arg of args) {
	if (arg !== "--check") {
		console.error(`Unknown argument: ${arg}`);
		process.exit(1);
	}
}

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function packageNameFromLockPath(lockPath) {
	const marker = "node_modules/";
	const index = lockPath.lastIndexOf(marker);
	if (index === -1) {
		return null;
	}

	const parts = lockPath.slice(index + marker.length).split("/");
	if (parts[0]?.startsWith("@")) {
		return `${parts[0]}/${parts[1]}`;
	}
	return parts[0];
}

function registryTarballUrl(packageName, version) {
	const tarballName = packageName.startsWith("@") ? packageName.split("/")[1] : packageName;
	return `https://registry.npmjs.org/${packageName}/-/${tarballName}-${version}.tgz`;
}

function createTempPackageJson(codingAgentPackage) {
	const tempPackage = JSON.parse(JSON.stringify(codingAgentPackage));
	const internalNames = new Set();

	delete tempPackage.devDependencies;

	for (const [name, relativePath] of INTERNAL_WORKSPACES) {
		const fileSpec = pathToFileURL(join(repoRoot, relativePath)).href;
		if (tempPackage.dependencies?.[name]) {
			tempPackage.dependencies[name] = fileSpec;
			internalNames.add(name);
		}
		if (tempPackage.optionalDependencies?.[name]) {
			tempPackage.optionalDependencies[name] = fileSpec;
			internalNames.add(name);
		}
	}

	return { internalNames, tempPackage };
}

function runNpmInstall(tempDir) {
	execFileSync(
		"npm",
		["install", "--package-lock-only", "--omit=dev", "--ignore-scripts", "--install-links=true", "--workspaces=false", "--audit=false", "--fund=false"],
		{ cwd: tempDir, stdio: "inherit" },
	);
}

function sanitizeLockfile(lockfile, codingAgentPackage, internalNames) {
	const packages = {};

	for (const [lockPath, entry] of Object.entries(lockfile.packages)) {
		const copied = { ...entry };
		delete copied.dev;
		delete copied.devOptional;
		delete copied.extraneous;
		delete copied.link;

		if (lockPath === "") {
			copied.name = codingAgentPackage.name;
			copied.version = codingAgentPackage.version;
			copied.dependencies = codingAgentPackage.dependencies;
			if (codingAgentPackage.optionalDependencies) {
				copied.optionalDependencies = codingAgentPackage.optionalDependencies;
			}
		} else {
			const packageName = packageNameFromLockPath(lockPath);
			if (packageName && internalNames.has(packageName)) {
				copied.resolved = registryTarballUrl(packageName, copied.version);
				delete copied.integrity;
			}
		}

		packages[lockPath] = copied;
	}

	return {
		name: codingAgentPackage.name,
		version: codingAgentPackage.version,
		lockfileVersion: 3,
		requires: true,
		packages,
	};
}

function validateShrinkwrap(shrinkwrap, internalNames) {
	const errors = [];
	const packageNames = new Set();

	for (const [lockPath, entry] of Object.entries(shrinkwrap.packages)) {
		const packageName = packageNameFromLockPath(lockPath);
		if (packageName) {
			packageNames.add(packageName);
		}
		if (entry.link) {
			errors.push(`${lockPath} is a link entry`);
		}
		if (typeof entry.resolved === "string" && /^(file:|\.\.?\/|\/)/.test(entry.resolved)) {
			errors.push(`${lockPath} has a local resolved value: ${entry.resolved}`);
		}
	}

	for (const name of internalNames) {
		if (!packageNames.has(name)) {
			errors.push(`internal dependency ${name} is missing`);
		}
	}

	const platformPackageCount = Object.values(shrinkwrap.packages).filter((entry) => entry.os || entry.cpu || entry.libc).length;
	if (platformPackageCount === 0) {
		errors.push("no platform-specific optional dependency entries found");
	}

	if (errors.length > 0) {
		throw new Error(`Generated shrinkwrap failed validation:\n${errors.map((error) => `  - ${error}`).join("\n")}`);
	}
}

function generateShrinkwrap() {
	const codingAgentPackage = readJson(join(codingAgentDir, "package.json"));
	const { internalNames, tempPackage } = createTempPackageJson(codingAgentPackage);
	const tempDir = mkdtempSync(join(tmpdir(), "pi-coding-agent-shrinkwrap-"));

	try {
		writeFileSync(join(tempDir, "package.json"), `${JSON.stringify(tempPackage, null, "\t")}\n`);
		copyFileSync(rootLockfilePath, join(tempDir, "package-lock.json"));
		runNpmInstall(tempDir);

		const lockfile = readJson(join(tempDir, "package-lock.json"));
		if (lockfile.lockfileVersion !== 3 || !lockfile.packages) {
			throw new Error("npm generated an unsupported package-lock.json");
		}

		const shrinkwrap = sanitizeLockfile(lockfile, codingAgentPackage, internalNames);
		validateShrinkwrap(shrinkwrap, internalNames);
		return shrinkwrap;
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
}

try {
	const shrinkwrap = generateShrinkwrap();
	const content = `${JSON.stringify(shrinkwrap, null, "\t")}\n`;

	if (checkOnly) {
		const current = readFileSync(shrinkwrapPath, "utf8");
		if (current !== content) {
			console.error("packages/coding-agent/npm-shrinkwrap.json is out of date.");
			console.error("Run: npm run shrinkwrap:coding-agent");
			process.exit(1);
		}
		console.log("packages/coding-agent/npm-shrinkwrap.json is up to date.");
	} else {
		writeFileSync(shrinkwrapPath, content);
		const packageCount = Object.keys(shrinkwrap.packages).length - 1;
		const platformPackageCount = Object.values(shrinkwrap.packages).filter((entry) => entry.os || entry.cpu || entry.libc).length;
		console.log(`Wrote packages/coding-agent/npm-shrinkwrap.json (${packageCount} packages, ${platformPackageCount} platform-specific).`);
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
