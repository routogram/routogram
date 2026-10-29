import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { CONSTANTS } from "@/lib/constants";

export async function SiteFooter() {
  const t = await getTranslations("site.footer");
  const common = await getTranslations("common");

  return (
    <footer className="border-t border-(--border) bg-black/20">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <p className="text-sm font-semibold text-slate-100">{common("brand")}</p>
          <p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">{t("tagline")}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {t("shop")}
          </p>
          <div className="mt-3 flex flex-col gap-2 text-xs text-slate-400">
            <Link href={CONSTANTS.ROUTES.home} className="hover:text-white">
              {t("shop")}
            </Link>
            <Link href={CONSTANTS.ROUTES.blackFriday} className="hover:text-white">
              {t("support")}
            </Link>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {t("support")}
          </p>
          <div className="mt-3 flex flex-col gap-2 text-xs text-slate-400">
            <span>{t("shipping")}</span>
            <span>{t("warranty")}</span>
            <span>{t("contact")}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
