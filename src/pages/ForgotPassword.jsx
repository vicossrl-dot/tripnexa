import { t, translateText } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, ArrowLeft, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function ForgotPassword() {
  useLocale();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.auth.resetPasswordRequest(email);
      setSent(true);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={Mail}
      title={t("ui.reset.password.e0edfeb")}
      subtitle={t("ui.we.ll.send.you.a.link.to.reset.it.fd1ca7a")}
      footer={
        <Link to="/login" className="text-primary font-medium hover:underline">
          <ArrowLeft className="w-3 h-3 inline mr-1" />{t("ui.back.to.log.in.30a8b4c")}</Link>
      }
    >
      {error && <p role="alert" className="mb-4 text-sm text-destructive">{translateText(error)}</p>}
      {sent ? (
        <p className="text-sm text-foreground text-center">{t("ui.if.an.account.exists.with.that.email.you.ll.receive.a.password.re.2907682")}</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t("ui.email.address.f2488fd")}</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="email"
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
          <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("ui.sending.286a3af")}</>
            ) : (
              t("ui.send.reset.link.708c5d6")
            )}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
