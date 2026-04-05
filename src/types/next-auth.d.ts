import { UserRole } from "@prisma/client";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: UserRole;
      organizationId: string;
    };
  }

  interface User {
    role: UserRole;
    organizationId: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
    organizationId?: string;
  }
}
