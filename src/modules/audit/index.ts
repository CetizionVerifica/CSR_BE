// Public surface of the audit module (M12 audit slice). Other modules import only from here
// (docs/revamp/06-modular-build.md §3); see ./CLAUDE.md.
export { AuditModule } from './audit.module';
export { AuditService, type AuditActor, type AuditEntry } from './audit.service';
