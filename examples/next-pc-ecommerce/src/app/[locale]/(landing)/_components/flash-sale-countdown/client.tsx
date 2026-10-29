"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { FlashSaleCountdownTemplate } from "./template";

const DEADLINE = new Date("2026-11-28T23:59:59Z").getTime();

function remaining() {
  const diff = Math.max(0, DEADLINE - Date.now());
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff / 3_600_000) % 24),
    minutes: Math.floor((diff / 60_000) % 60),
    seconds: Math.floor((diff / 1_000) % 60),
  };
}

export function FlashSaleCountdown() {
  const t = useTranslations("landing");
  const [time, setTime] = useState(remaining);

  useEffect(() => {
    const timer = window.setInterval(() => setTime(remaining()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  return <FlashSaleCountdownTemplate {...time} label={t("countdown")} />;
}
