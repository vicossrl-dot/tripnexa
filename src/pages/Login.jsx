import { t, translateText } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { safeReturnTo, resumeReturnTo } from '@/lib/authReturnTo';
import SocialButtons from '@/components/SocialButtons';
import { useAuth } from '@/lib/AuthContext';

export default function Login() {
  useLocale();
  const { checkUserAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(new URLSearchParams(window.location.search).has('socialError')?'Social sign-in was cancelled or could not be completed. Please try again.':'');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Read the actual DOM values too. Browser/password-manager autofill
      // does not always trigger React onChange for controlled inputs.
      const form = new FormData(e.currentTarget);
      const submittedEmail = String(form.get("email") || email || "").trim();
      const submittedPassword = String(form.get("password") || password || "");

      await api.auth.loginViaEmailPassword(submittedEmail, submittedPassword);

      // Confirm that the new server session is visible before leaving /login.
      await checkUserAuth();

      const target = await resumeReturnTo();
      window.location.replace(target);
    } catch (err) {
      setError(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };


  return (
    <AuthLayout
      icon={LogIn}
      title={t("ui.welcome.back.6621249")}
      subtitle={t("ui.log.in.to.your.account.62f1fe1")}
      footer={
        <>{t("ui.don.t.have.an.account.1b545b2")}{" "}
          <Link to={'/register?returnTo='+encodeURIComponent(safeReturnTo())} className="text-primary font-medium hover:underline">{t("ui.create.one.b6ab95e")}</Link>
        </>
      }
    >


      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {translateText(error)}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t("ui.email.969ccbd")}</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder={t("ui.you.example.com.53e6cdc")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t("ui.password.e7cf3ef")}</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">{t("ui.forgot.password.30c1d8d")}</Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              name="password"
              type="password" minLength={12} maxLength={128}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("ui.logging.in.09491d8")}</>
          ) : (
            t("ui.log.in.c189840")
          )}
        </Button>
      </form>
      <SocialButtons/>
    </AuthLayout>
  );
}
