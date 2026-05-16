import { ConfirmPageClient } from "@/components/confirmation/confirm-page-client";

export const dynamic = "force-dynamic";

export default async function ConfirmPage({
  params,
}: {
  params: Promise<{ externalId: string }>;
}) {
  const { externalId } = await params;
  return <ConfirmPageClient externalId={externalId} />;
}
