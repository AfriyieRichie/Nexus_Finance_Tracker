export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isSuperAdmin: boolean;
  organisations: Array<{
    organisationId: string;
    organisationName: string;
    role: string;
  }>;
}
