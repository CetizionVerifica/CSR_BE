// Public surface of M01 identity & access. Other modules import only from here
// (docs/revamp/06-modular-build.md §3); see ./CLAUDE.md for what each export is for.
export { IdentityModule } from './identity.module';
export { AuthenticationGuard } from './authentication.guard';
export { UsersRepository } from './users.repository';
export { IdentityMailer } from './identity-mailer';
export { AuthEvents } from './events';
export { identityEmails, transactionalEmail } from './emails';
export { slugify } from './auth.service';
export { emailField } from './dto/auth.dto';
export { encodeTenantToken, expiresAt, hashToken, TTL } from './engine/tokens';
export { decidePermission, type PermissionDecision } from './engine/permissions';
