import { IsEmail, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  // Existing accounts must still be able to sign in with their old password.
  @IsString()
  @MaxLength(4096)
  password: string;
}
