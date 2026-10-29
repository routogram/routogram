# @routogram/cloud-sync

Anonymized architecture snapshot packaging for Routogram.

- Collects topology + repo annotations.
- Scrubs absolute workspace paths and sensitive metadata keys.
- Publishes to:
  - a self-hosted Hub endpoint (`PUT /api/projects/:project/snapshots/:version`),
  - a presigned S3/R2 URL,
  - or `.routogram/snapshots/` locally.
