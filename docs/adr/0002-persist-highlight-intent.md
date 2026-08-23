# Persist highlight intent, not derived preview data

The schema v3 annotation project stores each scope's excluded record IDs and manually refined segment boundaries, while rebuilding default windows, merged segments, shooting summaries, and durations from the current annotation records. This preserves deliberate curation across an explicit project export without creating a second source of truth; stale or invalid highlight intent is discarded with a warning rather than blocking the underlying annotations from loading.
