# Use a local-first browser runtime

The annotation tool runs as a client-only Vite application: source videos stay on the user’s device, annotation projects are imported and exported as JSON, and no hosted database or sign-in is required. This replaces the original Sites and Cloudflare runtime because large local videos, offline review, and predictable data ownership matter more than hosted collaboration for this tool.
