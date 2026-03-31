import { UserRole } from '../../users/schemas/user.schema';

export interface JwtPayload {
  sub: string; // user ID
  email: string;
  role: UserRole;
}