import { Module } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { QUEUES, registerQueues } from '../../infra/queue/queues';
import { AccessRepository } from './access.repository';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthenticationGuard } from './authentication.guard';
import { BREACHED_PASSWORD_CHECKER, DisabledBreachedPasswordChecker, HibpChecker } from './breached-password';
import { IdentityMailer } from './identity-mailer';
import { InvitationsRepository } from './invitations.repository';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { InvitationsController, MembersController } from './members.controller';
import { MembersService } from './members.service';
import { MfaService } from './mfa.service';
import { PasswordService } from './password.service';
import { PlatformUsersController } from './platform-users.controller';
import { PlatformUsersService } from './platform-users.service';
import { SessionsRepository } from './sessions.repository';
import { SessionsService } from './sessions.service';
import { TokenService } from './token.service';
import { UsersRepository } from './users.repository';
import { WorkspaceAccessService } from './workspace-access.service';

/** M01 — Identity & access. */
@Module({
  imports: [registerQueues(QUEUES.email)],
  controllers: [
    AuthController,
    MeController,
    MembersController,
    InvitationsController,
    PlatformUsersController,
  ],
  providers: [
    {
      provide: BREACHED_PASSWORD_CHECKER,
      inject: [AppConfig],
      useFactory: (config: AppConfig) =>
        config.get('BREACHED_PASSWORD_CHECK') === 'hibp'
          ? new HibpChecker()
          : new DisabledBreachedPasswordChecker(),
    },
    AccessRepository,
    AuthService,
    AuthenticationGuard,
    IdentityMailer,
    InvitationsRepository,
    MeService,
    MembersService,
    MfaService,
    PasswordService,
    PlatformUsersService,
    SessionsRepository,
    SessionsService,
    TokenService,
    UsersRepository,
    WorkspaceAccessService,
  ],
  exports: [
    AuthenticationGuard,
    TokenService,
    WorkspaceAccessService,
    SessionsRepository,
    IdentityMailer,
    UsersRepository,
  ],
})
export class IdentityModule {}
