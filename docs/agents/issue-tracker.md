# Issue tracker: GitHub

Issues and specs for this repo live in GitHub Issues at `sy5938/annotation-web`. Use the `gh` CLI for all operations.

## Conventions

- Before implementation: create or fetch the Issue, make its acceptance criteria explicit, assign it to the authenticated user, and apply the relevant type label.
- During implementation: keep the Issue scope aligned with the requested change.
- After verification: add a completion comment containing the commit and checks run, then close the Issue.
- Multiline Markdown: pass it through `--body-file -`; use real newlines and never encode line breaks as `\n` inside `--body`.
- Create: `gh issue create --title "..." --body-file -`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open --json number,title,body,labels,comments`
- Comment: `gh issue comment <number> --body-file -`
- Label: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- Close: `gh issue close <number> --comment "..."`
- Infer the repository from the current Git checkout.

Completion criterion: read back every created or edited Issue and confirm its body renders as headings, paragraphs, lists, and checkboxes with no literal `\n` text.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Skill terminology

- “Publish to the issue tracker” means creating a GitHub issue.
- “Fetch the relevant ticket” means reading the GitHub issue and its comments.
- A Wayfinder map is one issue labelled `wayfinder:map`.
- Child tickets use `wayfinder:<type>` labels and GitHub sub-issues when available.
- Use native GitHub issue dependencies for blocking relationships when available.
- Claim work by assigning the issue to the authenticated user.
- Resolve work by commenting with the result and closing the issue.
