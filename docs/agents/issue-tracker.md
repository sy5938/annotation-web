# Issue tracker: GitHub

Issues and specs for this repo live in GitHub Issues at `sy5938/annotation-web`. Use the `gh` CLI for all operations.

## Conventions

- Create: `gh issue create --title "..." --body "..."`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open --json number,title,body,labels,comments`
- Comment: `gh issue comment <number> --body "..."`
- Label: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- Close: `gh issue close <number> --comment "..."`
- Infer the repository from the current Git checkout.

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
