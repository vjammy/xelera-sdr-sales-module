import { UserRole } from "@prisma/client";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { getServerSession, type DefaultSession, type NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import EmailProvider from "next-auth/providers/email";
import { redirect } from "next/navigation";
import { z } from "zod";
import { deliverMagicLinkEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type AppUser = DefaultSession["user"] & {
  id: string;
  email: string;
  role: UserRole;
  organizationId: string;
};

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    EmailProvider({
      from: process.env.AUTH_FROM_EMAIL || process.env.INVITE_FROM_EMAIL || "Xelera <onboarding@resend.dev>",
      async sendVerificationRequest({ identifier, url }) {
        const delivery = await deliverMagicLinkEmail({
          email: identifier,
          url,
        });

        if (delivery.state === "failed") {
          throw new Error(delivery.reason);
        }
      },
    }),
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);

        if (!parsed.success) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });

        if (!user) {
          return null;
        }

        if (!user.passwordHash) {
          return null;
        }

        const passwordValid = await bcrypt.compare(parsed.data.password, user.passwordHash);

        if (!passwordValid) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
          organizationId: user.organizationId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.organizationId = user.organizationId;
      }

      if ((!token.role || !token.organizationId) && token.sub) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
        });

        if (dbUser) {
          token.role = dbUser.role;
          token.organizationId = dbUser.organizationId;
        }
      }

      return token;
    },
    async session({ session, token }) {
      session.user = {
        ...session.user,
        id: token.sub ?? "",
        name: session.user?.name ?? "",
        email: session.user?.email ?? "",
        role: token.role as UserRole,
        organizationId: token.organizationId as string,
      };

      return session;
    },
  },
};

export async function auth() {
  return getServerSession(authOptions);
}

export async function requireUser() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return session.user as AppUser;
}
