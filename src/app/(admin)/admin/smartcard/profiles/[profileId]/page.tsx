import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/guards";
import {
  getSmartcardAdminProfile,
  listSmartcardThemes,
  listSmartcardAdminProfileLinks,
} from "@/lib/smartcard-admin";
import { PageHeader } from "@/components/shared/PageHeader";
import { SmartcardProfileForm } from "@/components/admin/SmartcardProfileForm";
import { SmartcardProfileLinksPanel } from "@/components/admin/SmartcardProfileLinksPanel";
import { SmartcardProfileDangerZone } from "@/components/admin/SmartcardProfileDangerZone";
import { Badge } from "@/components/ui/badge";

export default async function SmartcardProfileDetailPage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  await requireAdmin();
  const { profileId } = await params;

  const [profile, themes, links] = await Promise.all([
    getSmartcardAdminProfile(profileId),
    listSmartcardThemes(),
    listSmartcardAdminProfileLinks(profileId),
  ]);

  if (!profile) notFound();

  return (
    <div>
      <Link href="/admin/smartcard/profiles" className="mb-4 inline-block text-sm text-slate-500 hover:underline">
        ← Volver a perfiles
      </Link>

      <PageHeader
        title={profile.displayName}
        description={`${profile.clientName ?? "—"} · link.reymensolutions.mx/${profile.slug}`}
        actions={
          profile.deletedAt ? (
            <Badge variant="outline" className="border-slate-300 text-slate-500">
              Dado de baja
            </Badge>
          ) : undefined
        }
      />

      <SmartcardProfileForm
        profileId={profile.id}
        themes={themes ?? []}
        initial={{
          slug: profile.slug,
          displayName: profile.displayName,
          firstName: profile.firstName,
          lastName: profile.lastName,
          jobTitle: profile.jobTitle,
          company: profile.company,
          bio: profile.bio,
          photoUrl: profile.photoUrl,
          logoUrl: profile.logoUrl,
          phone: profile.phone,
          whatsapp: profile.whatsapp,
          email: profile.email,
          website: profile.website,
          address: profile.address,
          mapsUrl: profile.mapsUrl,
          instagram: profile.instagram,
          facebook: profile.facebook,
          linkedin: profile.linkedin,
          tiktok: profile.tiktok,
          youtube: profile.youtube,
          themeId: profile.themeId,
          status: profile.status,
          isNoindex: profile.isNoindex,
        }}
      />

      <div className="mt-10">
        <SmartcardProfileLinksPanel profileId={profile.id} initialLinks={links} />
      </div>

      <div className="mt-8">
        <SmartcardProfileDangerZone profileId={profile.id} deleted={!!profile.deletedAt} />
      </div>
    </div>
  );
}
