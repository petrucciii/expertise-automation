import { Injectable } from '@nestjs/common';
import {
  AuthenticationRegistry,
  JwtBearerProvider,
  type JwtClaims,
} from '@nestjs/authentication';
import { UsersRepository } from '../users/users.repository.js';
import type { AuthenticatedUser } from '../users/user.type.js';

@Injectable()
export class JwtAuthProvider extends JwtBearerProvider<AuthenticatedUser> {
  constructor(
    private readonly users: UsersRepository,
    registry: AuthenticationRegistry,
  ) {
    super({ realm: 'expertise-automation' });
    registry.registerProvider(this);
  }

  validate({ sub }: JwtClaims): Promise<AuthenticatedUser | null> {
    return sub ? this.users.findById(sub) : Promise.resolve(null);
  }
}
