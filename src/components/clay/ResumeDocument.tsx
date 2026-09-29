import type { ResumeProfileData } from "@/types/resume";

/**
 * The tailored resume, styled as a clean clay sheet. Also the print target:
 * printing the page renders only this node (see index.css print rules).
 */
export function ResumeDocument({ resume }: { resume: ResumeProfileData }) {
  return (
    <article className="resume-print flex flex-col gap-5 rounded-[1.6rem] bg-white p-6 text-[13px] leading-relaxed text-neutral-800 sm:p-8">
      <header className="flex flex-col gap-1 border-b-2 border-neutral-100 pb-4">
        <h2 className="text-2xl font-extrabold tracking-tight text-neutral-900">
          {resume.fullName || "Your Name"}
        </h2>
        <p className="text-sm font-semibold text-rose-500">
          {resume.title || "Professional Title"}
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          {[
            resume.email,
            resume.phone,
            resume.location,
            resume.portfolioUrl,
          ]
            .filter(Boolean)
            .join("  •  ")}
        </p>
      </header>

      {resume.summary && (
        <section>
          <h3 className="mb-1.5 text-xs font-extrabold uppercase tracking-[0.14em] text-rose-500">
            Summary
          </h3>
          <p>{resume.summary}</p>
        </section>
      )}

      {resume.skills.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-rose-500">
            Skills
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {resume.skills.map((skill) => (
              <span
                key={skill}
                className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-600"
              >
                {skill}
              </span>
            ))}
          </div>
        </section>
      )}

      {resume.experience.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-rose-500">
            Experience
          </h3>
          <div className="flex flex-col gap-4">
            {resume.experience.map((job, i) => (
              <div key={`${job.company}-${i}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="font-bold text-neutral-900">
                    {job.title}
                    {job.company && (
                      <span className="font-semibold text-neutral-600">
                        {" "}
                        · {job.company}
                      </span>
                    )}
                  </p>
                  <p className="text-xs font-medium text-neutral-500">
                    {job.startDate} – {job.endDate}
                  </p>
                </div>
                <ul className="mt-1.5 list-disc space-y-1 pl-5">
                  {job.bullets.map((bullet, j) => (
                    <li key={j}>{bullet}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {resume.education.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-rose-500">
            Education
          </h3>
          <div className="flex flex-col gap-2">
            {resume.education.map((edu, i) => (
              <p key={`${edu.school}-${i}`}>
                <span className="font-bold text-neutral-900">{edu.degree}</span>
                {edu.school && (
                  <span className="text-neutral-600"> · {edu.school}</span>
                )}
                {edu.gradYear && (
                  <span className="text-neutral-500"> · {edu.gradYear}</span>
                )}
              </p>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
