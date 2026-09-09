# IceBerg Online Design Review Platform V1.0

A single-file poll for reviewing website designs. Add each design with a hosted link and an uploaded screenshot, score them 1–5, leave comments, and view ranked results with score distributions. Screenshots are resized and compressed in the browser and embedded in the page data, so exported data files carry the images with them.

## Hosting on GitHub Pages

1. Create a new public repository on GitHub.
2. Upload `index.html` (and this README) to the repository root.
3. In the repository, go to Settings, then Pages. Under "Build and deployment", set Source to "Deploy from a branch", choose the `main` branch and `/ (root)` folder, and save.
4. After a minute or two, the poll is live at `https://<your-username>.github.io/<repository-name>/`.

Any later change to `index.html` redeploys automatically on push.

## How data is stored

Votes and the poll itself are saved in the browser's localStorage. This means:

- No backend or account is needed.
- Each person's votes are stored only on their own device, so the Results tab shows that browser's reviews, not a combined total across visitors.
- Clearing site data for the page clears the poll and its results.

## Collecting combined results with data files

The page exports and imports its data as a JSON file containing the poll and all reviews stored in that browser:

1. Build and launch the poll, open the Results tab, and click "Download data file". Share the site link and this file with reviewers.
2. Each reviewer opens the site, imports the file (the "Already have a poll file?" card on the setup screen), votes, then downloads their own data file from the Results tab and sends it back to you.
3. Import all returned files at once from your Results tab. Reviews are merged and de-duplicated automatically, and the Results tab then shows the combined scores and comments.

## Optional: store the data file in the repo

If a file named `poll-data.json` sits next to `index.html` in the repo, the page loads it automatically for first-time visitors, so reviewers don't need to import anything manually. To set this up: download your data file, rename it to `poll-data.json`, and commit it to the repository root. Re-commit an updated copy whenever you've merged new reviews and want the published results to reflect them. Visitors who already have data in their browser keep their own copy; the repo file only seeds first visits.

## Online voting for anonymous audiences (relay setup)

With the relay enabled, every submitted vote is committed automatically into `poll-data.json` in this repo (each vote appears as a commit), and all visitors see combined results — no accounts, no manual file exchange. The relay is a small Cloudflare Worker (`worker.js`) that holds your GitHub token privately.

Setup, once:

1. Commit your poll as `poll-data.json` in the repo root (see the section above). This file is what votes get written into.
2. Create a GitHub token: GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token. Under "Repository access" choose "Only select repositories" and pick this repo. Under "Permissions" set Repository permissions → Contents → Read and write. Generate and copy the token.
3. Create the Worker: sign up free at cloudflare.com → Workers & Pages → Create → Worker → deploy the starter, then open "Edit code", replace everything with the contents of `worker.js`, and deploy.
4. Configure it: in the Worker's Settings → Variables and Secrets, add a secret `GITHUB_TOKEN` (the token from step 2) and a variable `REPO` set to `your-username/your-repo-name`. If your default branch isn't `main`, also add `BRANCH`.
5. Connect the page: copy the Worker URL (like `https://your-worker.your-account.workers.dev`), open `index.html`, and paste it into the `RELAY_URL` constant near the top of the script. Commit and push.

From then on the page loads poll data through the relay, submits votes through it, and shows a "Refresh results" button on the Results tab. The export/import buttons keep working as a manual backup.

Notes:

- The relay validates every vote against the current poll (real item ids, scores 1–5, length caps) and de-duplicates by review id, but like any anonymous endpoint it can't stop someone determined to spam votes.
- The GitHub contents API caps the file at 1 MB. The page compresses screenshots to stay well under this; the relay refuses writes that would exceed it.
- To run a new poll, build it in the page, download its data file, and commit it as `poll-data.json` (replacing the old one). Votes for the old poll are rejected automatically after that.

## Readable results report (results.csv)

Who reviewed what, when, with what score and comment:

- **With the relay:** after each vote, the worker also regenerates `results.csv` in the repo root — one row per rating with columns Time (UTC), Reviewer, Design, Score, Comment. Open it on github.com and GitHub renders it as a searchable, sortable table; it also opens directly in Excel. To store it under a different name or folder, set a `RESULTS_PATH` variable on the worker.
- **Without the relay:** the Results tab has a "Download results (CSV)" button that produces the same report from whatever reviews are loaded; commit it to the repo manually if you want it there.

Reviewers who leave the name field blank appear as "Anonymous" — the poll never collects identity on its own. The raw machine-readable record of the same information lives in `poll-data.json`.

## Counting anonymous voters

Each browser that opens the poll is assigned a random voter ID, stored in that browser and attached to every review it submits. This makes anonymous activity countable and traceable without collecting any identity: reviews with no name display as "Anonymous #xxxxxx" (the ID's last six characters), the header shows how many distinct voters the reviews came from, and both CSV reports include the full ID in a Voter ID column, so repeat submissions from the same browser are easy to spot.

Its limits: the ID identifies a browser, not a person. The same person on a second device, in a private window, or after clearing site data gets a new ID, and two people sharing a browser share one. Treat it as a practical counter, not a security measure.

## Flushing test data

The Data file card on the Results tab has a "Flush all reviews" button. It deletes every review while keeping the poll and its designs, and resets `results.csv` — useful for clearing test votes before sharing the link for real.

- **With the relay**, flushing requires an admin key so visitors can't wipe the poll: add a secret named `ADMIN_KEY` to the worker (any passphrase you choose, same place as `GITHUB_TOKEN`) and redeploy. The page asks for that key when you confirm the flush, and the deletion is committed to `poll-data.json` like any vote — so the old test data also remains recoverable from the repo's commit history if ever needed.
- **Without the relay**, the flush simply clears the reviews stored in that browser.
- **Manual fallback:** you can always edit `poll-data.json` directly on github.com and set `"responses": []`.
