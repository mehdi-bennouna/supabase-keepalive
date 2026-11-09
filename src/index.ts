import { env } from "cloudflare:workers";
import { parseConfig } from "./config";
import { pingProject } from "./ping";

const { projects } = parseConfig(env.CONFIG);

export default {
	async scheduled() {
		const results = await Promise.all(projects.map((project) => pingProject(project)));
		for (const r of results) {
			if (r.ok) console.log({ message: `ok ${r.name}`, ...r });
			else console.error({ message: `FAILED ${r.name}: ${r.error}`, ...r });
		}
		const failed = results.filter((r) => !r.ok);
		if (failed.length > 0) {
			throw new Error(`${failed.length} of ${results.length} pings failed: ${failed.map((r) => r.name).join(", ")}`);
		}
	},
} satisfies ExportedHandler;
