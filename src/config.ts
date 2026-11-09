import { type } from "arktype";

const TProjectName = type("string").narrow((name, ctx) => /\S/.test(name) || ctx.mustBe("a non-blank string"));

const TProjectUrl = type("string")
	.narrow((value, ctx) => {
		let url: URL;
		try {
			url = new URL(value);
		} catch {
			return ctx.mustBe("a valid URL");
		}
		if (url.protocol !== "https:") {
			return ctx.mustBe("an https:// URL");
		}
		if (url.pathname !== "/" || url.search || url.hash) {
			return ctx.mustBe("the project's base URL with no path, like https://abcd.supabase.co");
		}
		return true;
	})
	.pipe((value) => new URL(value).origin);

const TProjectPublishableKey = type("string").narrow((key, ctx) => {
	if (key.startsWith("sb_secret_")) {
		return ctx.reject({
			expected: "a publishable key (sb_publishable_...), not a secret key: secret keys bypass RLS and a ping doesn't need one",
			actual: "",
		});
	}
	if (!/^sb_publishable_\S+$/.test(key)) {
		return ctx.reject({
			expected: "a publishable key (sb_publishable_...); legacy anon keys aren't supported",
			actual: "",
		});
	}
	return true;
});

const TProjectEntry = type({
	"+": "reject",
	"name": TProjectName,
	"url": TProjectUrl,
	"key": TProjectPublishableKey,
});

export type Project = typeof TProjectEntry.infer;

const TConfig = type({ projects: TProjectEntry.array().atLeastLength(1) }).narrow(({ projects }, ctx) => {
	const names = new Map<string, number>();

	projects.forEach((project, i) => {
		const sameName = names.get(project.name);
		if (sameName !== undefined) {
			ctx.reject({
				path: ["projects", i, "name"],
				message: `projects[${i}].name "${project.name}" is already used by projects[${sameName}]`,
			});
			return;
		}
		names.set(project.name, i);
	});

	return !ctx.hasError();
});

export type Config = typeof TConfig.infer;

export class ConfigError extends Error {
	constructor(readonly problems: string[]) {
		super(`Invalid CONFIG:\n  - ${problems.join("\n  - ")}`);
		this.name = "ConfigError";
	}
}

export function parseConfig(raw: string | undefined): Config {
	if (!raw) {
		throw new ConfigError(["the CONFIG secret is not set"]);
	}

	let json: unknown;

	try {
		json = JSON.parse(raw);
	} catch {
		throw new ConfigError(["must be valid JSON"]);
	}

	const result = TConfig(json);

	if (result instanceof type.errors) {
		throw new ConfigError(Array.from(result, (error) => error.message));
	}

	return result;
}
