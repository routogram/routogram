import { getTranslations } from "next-intl/server";

import { HeroBannerTemplate } from "./template";

export async function HeroBanner() {
  const t = await getTranslations("site.hero");
  return (
    <HeroBannerTemplate
      eyebrow={t("eyebrow")}
      title={t("title")}
      subtitle={t("subtitle")}
      primaryCta={t("primaryCta")}
      secondaryCta={t("secondaryCta")}
    />
  );
}
