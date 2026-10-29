import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role?: string;
      approvalStatus?: string;
      image?: string | null;
    };
  }

  interface User {
    role: string;
    approvalStatus?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    id?: string;
    approvalStatus?: string;
  }
}
