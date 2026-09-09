# Design review poll

A single-file poll for reviewing website designs. Add each design with a hosted link and a preview image, score them 1–5, leave comments, and view ranked results with score distributions.

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
