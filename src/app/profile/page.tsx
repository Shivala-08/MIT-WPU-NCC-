import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser, isApprovedAccount } from "@/lib/guard";
import prisma from "@/lib/prisma";
import { serializeProfile, ensureProfileForUser } from "@/lib/profile-service.mjs";
import { FIELD_LABELS, FIELD_OWNERSHIP } from "@/lib/profile-fields.mjs";
import ProfileClient from "./ProfileClient";

export const metadata: Metadata = {
  title: "My Profile | NCC MIT WPU",
  description: "View and complete your NCC cadet profile.",
};

export default async function ProfilePage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  if (!isApprovedAccount(user)) {
    redirect("/pending");
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      approvalStatus: true,
      rosterId: true,
    },
  });

  if (!dbUser) {
    redirect("/login");
  }

  const roster = await prisma.roster.findFirst({
    where: { users: { some: { id: user.id } } },
    select: {
      fullName: true,
      prn: true,
      regiNumber: true,
      wing: true,
      division: true,
      year: true,
      branch: true,
    },
  });

  const record = await ensureProfileForUser(prisma, {
    user: dbUser,
    rosterRow: roster,
  });

  const profile = serializeProfile(record);

  return (
    <ProfileClient
      user={{
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        role: dbUser.role,
      }}
      profile={profile}
      fieldOwnership={FIELD_OWNERSHIP}
      fieldLabels={FIELD_LABELS}
    />
  );
}
