import ky, { isHTTPError, isNetworkError, isTimeoutError } from "ky";
import type { Project } from "./config";

export type PingResult = {
	name: string;
	ok: boolean;
	status?: number;
	error?: string;
	attempts: number;
	durationMs: number;
};

export async function pingProject(project: Project): Promise<PingResult> {
	const started = Date.now();
	let sent = 0;
	const result = (r: Pick<PingResult, "ok" | "status" | "error">): PingResult => ({
		name: project.name,
		attempts: sent,
		durationMs: Date.now() - started,
		...r,
	});

	try {
		const res = await ky.post(`${project.url}/rest/v1/rpc/keepalive`, {
			headers: {
				"apikey": project.key,
				"User-Agent": "supabase-edge-ping",
			},
			json: {},
			timeout: 20_000,
			fetch: (input, init) => {
				sent++;
				return fetch(input, init);
			},
			retry: {
				limit: 1,
				delay: () => 3_000,
				maxRetryAfter: 30_000,
				methods: ["post"],
				shouldRetry: ({ error }) => {
					if (!isHTTPError(error)) return true;
					const { status } = error.response;
					return status >= 500 || status === 408 || status === 429;
				},
			},
		});
		await res.body?.cancel();
		return result({ ok: true, status: res.status });
	} catch (err) {
		return result({ ok: false, ...describeFailure(err) });
	}
}

function describeFailure(err: unknown): { status?: number; error: string } {
	if (isHTTPError(err)) {
		const { status } = err.response;
		const data = err.data ?? "";
		const body = (typeof data === "string" ? data : JSON.stringify(data)).replace(/\s+/g, " ").trim().slice(0, 300);
		return {
			status,
			error: `HTTP ${status}` + (body && `: ${body}`),
		};
	}
	if (isTimeoutError(err)) return { error: "request timed out" };
	const cause = isNetworkError(err) ? err.cause : err;
	return { error: cause instanceof Error ? cause.message || cause.name : String(cause) };
}
