/** Audit actions / domain events of M14 (written to audit_events, M12). Names are stable. */
export const FileEvents = {
  uploadStarted: 'file.upload_started',
  versionAdded: 'file.version_added',
  ready: 'file.ready',
  rejected: 'file.rejected',
  quarantined: 'file.quarantined',
  downloaded: 'file.downloaded',
  deleted: 'file.deleted',
  purged: 'file.purged',
} as const;
