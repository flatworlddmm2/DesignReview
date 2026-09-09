/*
  IceBerg Online Design Review Platform — voting relay (Cloudflare Worker)

  Receives votes from the poll page and commits them into poll-data.json
  in your GitHub repository. Also serves the current poll data to the page.

  Required settings (Worker → Settings → Variables and Secrets):
    GITHUB_TOKEN  (secret)   Fine-grained personal access token with
                             Contents: Read and write on this repo only
    REPO          (variable) e.g. "your-username/your-repo-name"
    BRANCH        (variable, optional) defaults to "main"
    FILE_PATH     (variable, optional) defaults to "poll-data.json"

  Endpoints:
    GET  /  -> { poll, responses }         current poll data
    POST /  -> { ok, poll, responses }     appends one validated review
*/

const MAX_FILE_BYTES = 900000;   // keep under GitHub's 1 MB contents API limit
const MAX_RESPONSES = 5000;
const MAX_COMMENT_CHARS = 2000;
const MAX_REVIEWER_CHARS = 80;

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors },
      });

    if (!env.GITHUB_TOKEN || !env.REPO) {
      return json({ error: "Relay is not configured (GITHUB_TOKEN and REPO are required)." }, 500);
    }

    const repo = env.REPO;
    const path = env.FILE_PATH || "poll-data.json";
    const branch = env.BRANCH || "main";
    const readUrl = `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`;
    const writeUrl = `https://api.github.com/repos/${repo}/contents/${path}`;

    const ghHeaders = {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "iceberg-design-review-relay",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    function fromBase64(b64) {
      const bin = atob(b64.replace(/\s/g, ""));
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }

    function toBase64(str) {
      const bytes = new TextEncoder().encode(str);
      let bin = "";
      for (const b of bytes) bin += String.fromCharCode(b);
      return btoa(bin);
    }

    async function readFile() {
      const res = await fetch(readUrl, { headers: ghHeaders });
      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? "poll-data.json was not found in the repo. Commit it first."
            : "GitHub read failed (" + res.status + ")."
        );
      }
      const file = await res.json();
      if (!file.content) {
        throw new Error("poll-data.json is too large for the GitHub API. Reduce image sizes.");
      }
      return { data: JSON.parse(fromBase64(file.content)), sha: file.sha };
    }

    /* ---------- GET: serve current poll data ---------- */

    if (request.method === "GET") {
      try {
        const { data } = await readFile();
        return json({ poll: data.poll || null, responses: data.responses || [] });
      } catch (e) {
        return json({ error: e.message || "Couldn't read the poll file." }, 502);
      }
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    /* ---------- POST: validate and commit one review ---------- */

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "Invalid JSON body." }, 400);
    }

    const r = body && body.response;
    if (!r || typeof r !== "object") return json({ error: "Missing response." }, 400);
    if (typeof r.id !== "string" || !r.id || r.id.length > 40) return json({ error: "Bad response id." }, 400);
    if (!r.ratings || typeof r.ratings !== "object") return json({ error: "Missing ratings." }, 400);

    for (let attempt = 0; attempt < 4; attempt++) {
      let current;
      try {
        current = await readFile();
      } catch (e) {
        return json({ error: e.message }, 502);
      }
      const { data, sha } = current;

      if (!data.poll || !Array.isArray(data.poll.items)) {
        return json({ error: "No poll is published yet." }, 409);
      }

      const pollId = data.poll.id || "p" + (data.poll.createdAt || 0);
      if (body.pollId && String(body.pollId) !== String(pollId)) {
        return json({ error: "This vote belongs to a different poll. Reload the page." }, 409);
      }

      const itemIds = new Set(data.poll.items.map((i) => i.id));

      const ratings = {};
      for (const [k, v] of Object.entries(r.ratings)) {
        if (itemIds.has(k) && Number.isInteger(v) && v >= 1 && v <= 5) ratings[k] = v;
      }
      if (!Object.keys(ratings).length) return json({ error: "No valid ratings." }, 400);

      const comments = {};
      if (r.comments && typeof r.comments === "object") {
        for (const [k, v] of Object.entries(r.comments)) {
          if (itemIds.has(k) && typeof v === "string" && v.trim()) {
            comments[k] = v.trim().slice(0, MAX_COMMENT_CHARS);
          }
        }
      }

      const clean = {
        id: r.id,
        reviewer: typeof r.reviewer === "string" ? r.reviewer.trim().slice(0, MAX_REVIEWER_CHARS) : "",
        ratings,
        comments,
        at: Date.now(),
      };

      const responses = Array.isArray(data.responses) ? data.responses : [];
      if (responses.some((x) => x && x.id === clean.id)) {
        return json({ ok: true, poll: data.poll, responses }); // already saved
      }
      if (responses.length >= MAX_RESPONSES) {
        return json({ error: "This poll has reached its response limit." }, 409);
      }

      const updated = JSON.stringify({ ...data, responses: [...responses, clean] }, null, 2);
      if (updated.length > MAX_FILE_BYTES) {
        return json({ error: "The poll file has reached its size limit." }, 409);
      }

      const putRes = await fetch(writeUrl, {
        method: "PUT",
        headers: { ...ghHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Add review " + clean.id,
          content: toBase64(updated),
          sha,
          branch,
        }),
      });

      if (putRes.ok) {
        return json({ ok: true, poll: data.poll, responses: [...responses, clean] });
      }
      if (putRes.status !== 409 && putRes.status !== 422) {
        return json({ error: "GitHub write failed (" + putRes.status + ")." }, 502);
      }
      // Someone else committed at the same moment; wait briefly and retry.
      await new Promise((res) => setTimeout(res, 200 + Math.random() * 400));
    }

    return json({ error: "Too many votes at once. Try again in a moment." }, 503);
  },
};
