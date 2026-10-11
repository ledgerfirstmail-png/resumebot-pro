import logo from "@/assets/logo.svg";
import { ClayButton } from "@/components/clay/ClayButton";
import { ClayCard } from "@/components/clay/ClayCard";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  Briefcase,
  Gauge,
  MousePointerClick,
  Printer,
  Radar,
  ScrollText,
  Sparkles,
  Target,
  Wand2,
} from "lucide-react";
import { useNavigate } from "react-router";

const HOW_IT_WORKS = [
  {
    icon: ScrollText,
    color: "bg-clay-butter",
    text: "text-amber-700",
    title: "Tell Tailorly about you",
    body: "Build your master resume profile once — skills, experience, education. It lives in your private workspace.",
  },
  {
    icon: MousePointerClick,
    color: "bg-clay-sky",
    text: "text-sky-800",
    title: "Paste any job posting",
    body: "Drop in the full description from your dream job listing. That's the whole input.",
  },
  {
    icon: Wand2,
    color: "bg-clay-lilac",
    text: "text-purple-800",
    title: "AI sculpts your resume",
    body: "Your bullets are rewritten to mirror the job's own language — using only your real experience, never inventions.",
  },
  {
    icon: Gauge,
    color: "bg-clay-mint",
    text: "text-emerald-800",
    title: "Score what businesses want",
    body: "Get an honest match score with a per-category breakdown, then export a clean, ATS-friendly resume.",
  },
];

const FEATURES = [
  {
    icon: Target,
    color: "bg-clay-blush",
    text: "text-rose-700",
    title: "Mirrors the job's language",
    body: "ATS filters read keywords. Tailorly weaves the posting's exact terms into bullets where they're genuinely true.",
  },
  {
    icon: BadgeCheck,
    color: "bg-clay-mint",
    text: "text-emerald-800",
    title: "Honest by design",
    body: "Every claim traces back to your profile. No invented jobs, degrees, or metrics — just your story, told better.",
  },
  {
    icon: Printer,
    color: "bg-clay-sky",
    text: "text-sky-800",
    title: "Print-perfect export",
    body: "One click gives you a clean, single-column PDF that sails through parsers and looks great in human hands.",
  },
  {
    icon: Sparkles,
    color: "bg-clay-butter",
    text: "text-amber-700",
    title: "A collection, not a file",
    body: "Every tailored version is saved with its score, so you can compare which angle wins before you apply.",
  },
  {
    icon: Radar,
    color: "bg-clay-lilac",
    text: "text-purple-800",
    title: "Job radar finds the employers",
    body: "Scan live job boards in one click — openings arrive tiered as strong, good, and worth-a-look against your resume, so you know where you're strong before you apply.",
  },
  {
    icon: Bell,
    color: "bg-clay-sky",
    text: "text-sky-800",
    title: "Auto-apply, then watch",
    body: "Auto-apply to shortlisted hits with a fresh tailored resume each — and let saved watches email you, or ping Telegram, when new matches land.",
  },
  {
    icon: Briefcase,
    color: "bg-clay-blush",
    text: "text-rose-700",
    title: "Track every application",
    body: "A pipeline view from applied to interview to offer — see where each posting stands, with the dates and scores behind it.",
  },
];

export default function Landing() {
  const navigate = useNavigate();

  const handleGetStarted = () => navigate("/dashboard");

  const handleSeeHow = () =>
    document
      .getElementById("how-it-works")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="clay-bg min-h-screen">
      {/* Nav */}
      <header className="sticky top-0 z-40 bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex h-18 w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="clay-orb size-11 bg-white p-2">
              <img src={logo} alt="Tailorly logo" className="size-full" />
            </span>
            <span className="clay-title text-xl">Tailorly</span>
          </div>
          <ClayButton variant="soft" onClick={handleGetStarted}>
            Open studio <ArrowRight />
          </ClayButton>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
        {/* Hero */}
        <section className="flex flex-col items-center gap-6 pb-16 pt-14 text-center sm:pt-20">
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="clay-chip px-4 py-2 text-xs font-bold uppercase tracking-widest"
          >
            <Sparkles className="mr-1.5 inline size-3.5" />
            Resume tailoring that scores
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.08 }}
            className="clay-title max-w-3xl text-4xl leading-[1.05] sm:text-6xl"
          >
            Your resume,{" "}
            <span className="text-primary">squished to fit</span> every job you
            actually want.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.16 }}
            className="max-w-xl text-base leading-7 text-muted-foreground sm:text-lg"
          >
            Paste a job posting. Tailorly rebuilds your resume to mirror what
            that business is looking for — and shows you the score before you
            ever hit apply.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.24 }}
            className="mt-2 flex flex-wrap items-center justify-center gap-3"
          >
            <ClayButton size="lg" onClick={handleGetStarted}>
              <Wand2 /> Build my tailored resume
            </ClayButton>
            <ClayButton variant="soft" size="lg" onClick={handleSeeHow}>
              See how it works <ArrowRight />
            </ClayButton>
            <span className="text-xs font-semibold text-muted-foreground">
              Free · runs in your browser
            </span>
          </motion.div>

          {/* Squishy hero mock */}
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.35 }}
            className="clay-card mt-10 w-full max-w-4xl p-5 sm:p-8"
          >
            <div className="grid gap-4 sm:grid-cols-[1.2fr_1fr]">
              <div className="clay-inset rounded-3xl p-5 text-left">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Paste the job posting
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  “Senior Product Designer — own end-to-end design for our
                  onboarding flow. 5+ years of experience, strong design systems
                  background, comfortable running user research…”
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {["design systems", "onboarding", "user research", "B2B"].map(
                    (kw) => (
                      <span
                        key={kw}
                        className="clay-chip px-2.5 py-1 text-[11px] font-semibold"
                      >
                        {kw}
                      </span>
                    ),
                  )}
                </div>
              </div>
              <div className="flex flex-col items-center justify-center gap-3 rounded-3xl bg-clay-blush/70 p-5">
                <span className="text-4xl font-extrabold tabular-nums text-rose-700">
                  92%
                </span>
                <span className="text-xs font-bold uppercase tracking-widest text-rose-700/80">
                  Match score
                </span>
                <div className="flex w-full flex-col gap-1.5">
                  {[
                    ["Skills", "bg-rose-400", "w-11/12"],
                    ["Experience", "bg-sky-400", "w-4/5"],
                    ["Formatting", "bg-amber-300", "w-full"],
                  ].map(([label, color, width]) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="w-16 text-right text-[10px] font-bold text-rose-900/70">
                        {label}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/60">
                        <div className={`h-full ${color} ${width} rounded-full`} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-24 pb-16">
          <h2 className="clay-title mb-8 text-center text-3xl">
            Four soft steps, one sharp resume
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.45, delay: i * 0.08 }}
                >
                  <ClayCard className="h-full">
                    <div className="mb-4 flex items-center justify-between">
                      <span className={`clay-orb size-12 ${step.color}`}>
                        <Icon className={`size-5 ${step.text}`} />
                      </span>
                      <span className="text-3xl font-extrabold text-foreground/10">
                        {i + 1}
                      </span>
                    </div>
                    <h3 className="text-base font-bold">{step.title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                      {step.body}
                    </p>
                  </ClayCard>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* Features */}
        <section className="pb-16">
          <h2 className="clay-title mb-2 text-center text-3xl">
            Built for honest, high-scoring applications
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-center text-sm text-muted-foreground">
            Not a keyword stuffer — a tailoring engine with rules.
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.45, delay: i * 0.07 }}
                >
                  <ClayCard className="clay-card-hover h-full">
                    <div className="flex gap-4">
                      <span className={`clay-orb size-12 shrink-0 ${feature.color}`}>
                        <Icon className={`size-5 ${feature.text}`} />
                      </span>
                      <div>
                        <h3 className="text-base font-bold">{feature.title}</h3>
                        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                          {feature.body}
                        </p>
                      </div>
                    </div>
                  </ClayCard>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* Final CTA */}
        <section>
          <ClayCard className="relative overflow-hidden text-center">
            <div className="pointer-events-none absolute -left-14 -top-14 size-48 rounded-full bg-clay-butter opacity-70 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-16 -right-10 size-48 rounded-full bg-clay-lilac opacity-60 blur-2xl" />
            <div className="pointer-events-none absolute -right-14 top-10 size-40 rounded-full bg-clay-blush opacity-60 blur-2xl" />
            <div className="relative flex flex-col items-center gap-4 py-6">
              <span className="clay-orb size-14 bg-white">
                <img src={logo} alt="" className="size-8" />
              </span>
              <h2 className="clay-title text-3xl sm:text-4xl">
                Ready to score your next application?
              </h2>
              <p className="max-w-md text-sm leading-6 text-muted-foreground">
                Build your profile once — then let the job radar bring hiring
                employers to you, tailor every application, track it from
                applied to interview, and watch the score climb past what
                businesses are looking for.
              </p>
              <ClayButton size="lg" onClick={handleGetStarted}>
                Get started free <ArrowRight />
              </ClayButton>
            </div>
          </ClayCard>
        </section>
      </main>

      <footer className="pb-8 text-center text-xs text-muted-foreground">
        Tailorly · tailored resumes with honest scores
      </footer>
    </div>
  );
}
