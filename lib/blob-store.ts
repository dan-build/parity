/**
 * Private Vercel Blob storage for history snapshots. The store must be created as Private
 * (Vercel → Storage → Blob → access: Private) and connected to the project, which provides
 * the credentials. Private blobs have no public URL: reading one needs the store's token.
 */
import { put } from "@vercel/blob";
import type { SnapshotStore } from "./snapshot-cron";

export function blobStore(): SnapshotStore {
  return {
    async put(path, body) {
      await put(path, body, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/x-ndjson" });
    },
  };
}
