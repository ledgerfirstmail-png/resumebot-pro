import logo from "@/assets/logo.svg";
import { ClayButton } from "@/components/clay/ClayButton";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, Mail, UserX } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      setStep({ email: formData.get("email") as string });
      setIsLoading(false);
    } catch (error) {
      console.error("Email sign-in error:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to send verification code. Please try again.",
      );
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      navigate(redirect);
    } catch (error) {
      console.error("OTP verification error:", error);
      setError("The verification code you entered is incorrect.");
      setIsLoading(false);
      setOtp("");
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("anonymous");
      navigate(redirect);
    } catch (error) {
      console.error("Guest login error:", error);
      setError(
        `Failed to sign in as guest: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="clay-bg flex min-h-screen flex-col">
      <div className="flex flex-1 items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="clay-card w-full max-w-md p-7 sm:p-9"
        >
          {step === "signIn" ? (
            <>
              <div className="flex flex-col items-center text-center">
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  aria-label="Back to home"
                  className="clay-orb size-16 bg-white p-3 outline-none focus-visible:ring-4 focus-visible:ring-ring/40"
                >
                  <img src={logo} alt="Tailorly logo" className="size-full" />
                </button>
                <h1 className="clay-title mt-4 text-2xl">
                  Welcome to Tailorly
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Enter your email to log in or sign up
                </p>
              </div>
              <form onSubmit={handleEmailSubmit} className="mt-6 flex flex-col gap-4">
                <div className="relative flex items-center">
                  <Mail className="pointer-events-none absolute left-4 z-10 size-4 text-muted-foreground" />
                  <Input
                    name="email"
                    placeholder="name@example.com"
                    type="email"
                    className="h-12 rounded-2xl border-0 bg-input pl-10 pr-14 text-sm shadow-none shadow-[inset_0_2px_6px_oklch(0.5_0.08_350/0.12)]"
                    disabled={isLoading}
                    required
                  />
                  <ClayButton
                    type="submit"
                    size="icon"
                    disabled={isLoading}
                    className="absolute right-1.5"
                    aria-label="Send verification code"
                  >
                    {isLoading ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <ArrowRight />
                    )}
                  </ClayButton>
                </div>
                {error && (
                  <p className="text-sm font-semibold text-rose-600">{error}</p>
                )}

                <div className="relative my-1">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/70" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-transparent px-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      <span className="rounded-full bg-card px-2 py-0.5">or</span>
                    </span>
                  </div>
                </div>

                <ClayButton
                  type="button"
                  variant="soft"
                  className="w-full"
                  onClick={handleGuestLogin}
                  disabled={isLoading}
                >
                  <UserX />
                  Continue as Guest
                </ClayButton>
              </form>
            </>
          ) : (
            <>
              <div className="flex flex-col items-center text-center">
                <span className="clay-orb size-16 bg-clay-butter p-4">
                  <Mail className="size-full text-amber-700" />
                </span>
                <h1 className="clay-title mt-4 text-2xl">Check your email</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  We've sent a 6-digit code to {step.email}
                </p>
              </div>
              <form onSubmit={handleOtpSubmit} className="mt-6 flex flex-col gap-4">
                <input type="hidden" name="email" value={step.email} />
                <input type="hidden" name="code" value={otp} />

                <div className="flex justify-center">
                  <InputOTP
                    value={otp}
                    onChange={setOtp}
                    maxLength={6}
                    disabled={isLoading}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        otp.length === 6 &&
                        !isLoading
                      ) {
                        const form = (e.target as HTMLElement).closest("form");
                        if (form) {
                          form.requestSubmit();
                        }
                      }
                    }}
                  >
                    <InputOTPGroup>
                      {Array.from({ length: 6 }).map((_, index) => (
                        <InputOTPSlot key={index} index={index} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                {error && (
                  <p className="text-center text-sm font-semibold text-rose-600">
                    {error}
                  </p>
                )}
                <p className="text-center text-sm text-muted-foreground">
                  Didn't receive a code?{" "}
                  <ClayButton
                    variant="ghost"
                    className="h-auto p-0 text-sm font-bold text-primary"
                    onClick={() => setStep("signIn")}
                  >
                    Try again
                  </ClayButton>
                </p>
                <ClayButton
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={isLoading || otp.length !== 6}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="animate-spin" /> Verifying…
                    </>
                  ) : (
                    <>
                      Verify code <ArrowRight />
                    </>
                  )}
                </ClayButton>
                <ClayButton
                  type="button"
                  variant="ghost"
                  onClick={() => setStep("signIn")}
                  disabled={isLoading}
                  className="w-full"
                >
                  Use different email
                </ClayButton>
              </form>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
