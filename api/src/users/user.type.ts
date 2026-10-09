export interface AuthenticatedUser {
  id: number;
  email: string;
}

declare module '@nestjs/authentication' {
  interface AuthenticationTypes {
    user: AuthenticatedUser;
  }
}
