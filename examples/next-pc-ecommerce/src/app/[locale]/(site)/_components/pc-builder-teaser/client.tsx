"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import type { BuilderOption } from "@/lib/apis/models/product.model";
import { PcBuilderTeaserTemplate } from "./template";

type OptionKey = "cpu" | "gpu" | "memory";

export function PcBuilderTeaser({ options }: { options: BuilderOption[] }) {
  const locale = useLocale();
  const t = useTranslations("site.builder");
  const grouped = useMemo(
    () => ({
      cpu: options.filter((option) => option.category === "CPU"),
      gpu: options.filter((option) => option.category === "GPU"),
      memory: options.filter((option) => option.category === "Memory"),
    }),
    [options],
  );
  const [selected, setSelected] = useState<Record<OptionKey, string>>({
    cpu: grouped.cpu[0]?.id ?? "",
    gpu: grouped.gpu[0]?.id ?? "",
    memory: grouped.memory[0]?.id ?? "",
  });

  const total = (Object.keys(grouped) as OptionKey[]).reduce((sum, key) => {
    const option = grouped[key].find((candidate) => candidate.id === selected[key]);
    return sum + (option?.price ?? 0);
  }, 0);

  return (
    <PcBuilderTeaserTemplate
      options={grouped}
      selected={selected}
      total={total + 149}
      locale={locale}
      labels={{
        eyebrow: t("eyebrow"),
        title: t("title"),
        cpu: t("cpu"),
        gpu: t("gpu"),
        memory: t("memory"),
        estimated: t("estimated"),
        calculate: t("calculate"),
      }}
      onSelect={(key, value) => setSelected((current) => ({ ...current, [key]: value }))}
      onCalculate={() => {
        document.getElementById("featured-builds")?.scrollIntoView({ behavior: "smooth" });
      }}
    />
  );
}
