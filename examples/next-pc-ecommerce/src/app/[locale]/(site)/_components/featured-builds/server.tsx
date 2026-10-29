import { getLocale, getTranslations } from "next-intl/server";

import type { FeaturedBuildView } from "../../_handlers";
import { FeaturedBuildsTemplate } from "./template";

export async function FeaturedBuilds({ builds }: { builds: FeaturedBuildView[] }) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("site.featured")]);

  return (
    <FeaturedBuildsTemplate
      builds={builds}
      locale={locale}
      eyebrow={t("eyebrow")}
      title={t("title")}
      subtitle={t("subtitle")}
    />
  );
}
