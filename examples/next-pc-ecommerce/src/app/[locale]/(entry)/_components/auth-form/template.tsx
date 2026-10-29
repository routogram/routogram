import { Loader2, LockKeyhole, Mail, UserRound } from "lucide-react";

import { Button, Input } from "@/components/ui";
import { Link } from "@/i18n/navigation";

export type AuthFormLabels = {
  title: string;
  subtitle: string;
  name: string;
  email: string;
  password: string;
  submit: string;
  switchLabel: string;
  switchCta: string;
  demo: string;
};

export type AuthFormTemplateProps = {
  mode: "login" | "sign-up";
  labels: AuthFormLabels;
  values: { name: string; email: string; password: string };
  loading: boolean;
  error: string | null;
  onChange: (field: "name" | "email" | "password", value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function AuthFormTemplate({
  mode,
  labels,
  values,
  loading,
  error,
  onChange,
  onSubmit,
}: AuthFormTemplateProps) {
  return (
    <div>
      <div className="mb-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300">
          PC Forge account
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">
          {labels.title}
        </h1>
        <p className="mt-2 text-xs leading-5 text-slate-500">{labels.subtitle}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        {mode === "sign-up" ? (
          <label htmlFor="auth-name" className="block">
            <span className="text-[10px] text-slate-500">{labels.name}</span>
            <div className="relative mt-1">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-600" />
              <Input
                id="auth-name"
                value={values.name}
                onChange={(event) => onChange("name", event.target.value)}
                required
                autoComplete="name"
                className="pl-9"
              />
            </div>
          </label>
        ) : null}
        <label htmlFor="auth-email" className="block">
          <span className="text-[10px] text-slate-500">{labels.email}</span>
          <div className="relative mt-1">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-600" />
            <Input
              id="auth-email"
              type="email"
              value={values.email}
              onChange={(event) => onChange("email", event.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="pl-9"
            />
          </div>
        </label>
        <label htmlFor="auth-password" className="block">
          <span className="text-[10px] text-slate-500">{labels.password}</span>
          <div className="relative mt-1">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-600" />
            <Input
              id="auth-password"
              type="password"
              value={values.password}
              onChange={(event) => onChange("password", event.target.value)}
              required
              minLength={4}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="••••••••"
              className="pl-9"
            />
          </div>
        </label>

        {error ? (
          <p className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-[11px] text-rose-200">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={loading} className="mt-2 w-full">
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          {labels.submit}
        </Button>
      </form>

      <p className="mt-5 text-center text-[11px] text-slate-500">
        {labels.switchLabel}{" "}
        <Link
          href={mode === "login" ? "/auth/sign-up" : "/auth/login"}
          className="text-sky-300 hover:text-sky-200"
        >
          {labels.switchCta}
        </Link>
      </p>
      <p className="mt-4 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-center text-[9px] leading-4 text-slate-600">
        {labels.demo}
      </p>
    </div>
  );
}
