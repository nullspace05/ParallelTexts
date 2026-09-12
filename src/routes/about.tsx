import { ClickableSampleImage } from "@/components/clickable-sample-image"
import { SAMPLE_CREDITS } from "@/lib/sample-credits"
import { GITHUB_REPO_URL } from "@/lib/site-links"
import {
  BookOpenIcon,
  BrainIcon,
  DownloadIcon,
  FileTextIcon,
  GitMergeIcon,
  UsersIcon,
} from "@phosphor-icons/react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Trans, useTranslation } from "react-i18next"

export const Route = createFileRoute("/about")({ component: AboutPage })

const LICENSE_URL = `${GITHUB_REPO_URL}/blob/main/LICENSE`

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary/10">
          <Icon className="size-4 text-primary" />
        </div>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <div className="space-y-2 pl-10 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  )
}

function AboutPage() {
  const { t } = useTranslation()

  return (
    <div className="mx-auto max-w-2xl space-y-10 px-4 py-10">
      {/* Hero */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <img
            src="/favicon.svg"
            alt=""
            className="size-14 shrink-0 rounded-sm"
          />
          <h1 className="text-2xl font-bold tracking-tight">ParallelTexts</h1>
        </div>
        <p className="leading-relaxed text-muted-foreground">
          {t("about.hero.description")}
        </p>
        <ClickableSampleImage
          src="/samples/aiw-01.png"
          alt={t("about.hero.imageAlt")}
          imgClassName="w-full rounded-lg"
        />
      </div>

      <div className="space-y-8">
        <Section icon={BookOpenIcon} title={t("about.whatIsIt.title")}>
          <p>{t("about.whatIsIt.p1")}</p>
          <p>
            <Trans
              i18nKey="about.whatIsIt.p2"
              components={{ bold: <strong className="text-foreground" /> }}
            />
          </p>
        </Section>

        <Section icon={UsersIcon} title={t("about.whoIsItFor.title")}>
          <ul className="list-none space-y-1.5">
            <li>
              <Trans
                i18nKey="about.whoIsItFor.learners"
                components={{
                  bold: <span className="font-medium text-foreground" />,
                }}
              />
            </li>
            <li>
              <Trans
                i18nKey="about.whoIsItFor.linguists"
                components={{
                  bold: <span className="font-medium text-foreground" />,
                }}
              />
            </li>
            <li>
              <Trans
                i18nKey="about.whoIsItFor.researchers"
                components={{
                  bold: <span className="font-medium text-foreground" />,
                }}
              />
            </li>
          </ul>
          <p className="mt-2">{t("about.whoIsItFor.footer")}</p>
        </Section>

        <Section icon={BrainIcon} title={t("about.howItWorks.title")}>
          <p>{t("about.howItWorks.intro")}</p>
          <ol className="mt-2 list-none space-y-2">
            <li>
              <Trans
                i18nKey="about.howItWorks.step1"
                components={{
                  bold: <span className="font-medium text-foreground" />,
                }}
              />
            </li>
            <li>
              <Trans
                i18nKey="about.howItWorks.step2"
                components={{
                  bold: <span className="font-medium text-foreground" />,
                }}
              />
            </li>
            <li>
              <Trans
                i18nKey="about.howItWorks.step3"
                components={{
                  bold: <span className="font-medium text-foreground" />,
                }}
              />
            </li>
          </ol>
          <p className="mt-2">{t("about.howItWorks.outro")}</p>
        </Section>

        <Section icon={DownloadIcon} title={t("about.modelDownload.title")}>
          <p>{t("about.modelDownload.p1")}</p>
          <p>{t("about.modelDownload.p2")}</p>
          <p>
            <Trans
              i18nKey="about.modelDownload.p3"
              components={{
                settingsLink: (
                  <Link
                    to="/settings"
                    className="text-primary underline-offset-4 hover:underline"
                  />
                ),
              }}
            />
          </p>
        </Section>

        <Section icon={FileTextIcon} title={t("about.formats.title")}>
          <ul className="list-none space-y-1">
            <li>
              <Trans
                i18nKey="about.formats.epub"
                components={{
                  bold: <span className="font-medium text-foreground" />,
                }}
              />
            </li>
            <li>
              <Trans
                i18nKey="about.formats.pdf"
                components={{
                  bold: <span className="font-medium text-foreground" />,
                }}
              />
            </li>
            <li>
              <Trans
                i18nKey="about.formats.txt"
                components={{
                  bold: <span className="font-medium text-foreground" />,
                }}
              />
            </li>
          </ul>
          <p className="mt-1">{t("about.formats.furigana")}</p>
        </Section>

        <Section icon={GitMergeIcon} title={t("about.reading.title")}>
          <p>{t("about.reading.intro")}</p>
          <ul className="mt-1 list-none space-y-1.5">
            <li>
              <Trans
                i18nKey="about.reading.popover"
                components={{
                  bold: <span className="font-medium text-foreground" />,
                }}
              />
            </li>
            <li>
              <Trans
                i18nKey="about.reading.sideBySide"
                components={{
                  bold: <span className="font-medium text-foreground" />,
                }}
              />
            </li>
          </ul>
          <p className="mt-2">{t("about.reading.exportIntro")}</p>
          <ul className="mt-1 list-none space-y-1.5">
            <li>
              <Trans
                i18nKey="about.reading.epub"
                components={{
                  bold: <span className="font-medium text-foreground" />,
                }}
              />
            </li>
            <li>
              <Trans
                i18nKey="about.reading.tsv"
                components={{
                  bold: <span className="font-medium text-foreground" />,
                }}
              />
            </li>
          </ul>
          <p className="mt-2">
            <Trans
              i18nKey="about.reading.importBack"
              components={{
                bold: <span className="font-medium text-foreground" />,
                alignmentsLink: (
                  <Link
                    to="/alignments"
                    className="text-primary underline-offset-4 hover:underline"
                  />
                ),
                booksLink: (
                  <Link
                    to="/books"
                    className="text-primary underline-offset-4 hover:underline"
                  />
                ),
              }}
            />
          </p>
        </Section>

        <Section icon={BookOpenIcon} title={t("about.credits.title")}>
          <p>{t("about.credits.intro")}</p>
          <ul className="mt-2 list-none space-y-4">
            {SAMPLE_CREDITS.map((credit) => (
              <li key={credit.title}>
                <p className="font-medium text-foreground">
                  {credit.title}
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    / {credit.subtitle}
                  </span>
                </p>
                <p className="mt-0.5">{credit.original}</p>
                <ul className="mt-1 list-none space-y-0.5">
                  {credit.sources.map((source) => (
                    <li key={source.language}>
                      <span className="font-medium text-foreground">
                        {source.language}:
                      </span>{" "}
                      {source.credit}
                      {source.links && source.links.length > 0 && (
                        <>
                          {" "}
                          (
                          {source.links.map((link, i) => (
                            <span key={link.href}>
                              {i > 0 && ", "}
                              <a
                                href={link.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary underline-offset-4 hover:underline"
                              >
                                {link.label}
                              </a>
                            </span>
                          ))}
                          )
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      {/* Back link */}
      <div className="border-t pt-6">
        <Link
          to="/"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {t("about.backHome")}
        </Link>
      </div>

      {/* Footer credit */}
      <div className="text-center text-xs text-muted-foreground">
        <Trans
          i18nKey="about.footer.createdBy"
          components={{
            nullspaceLink: (
              <a
                href="https://nullspace.nz"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-4 hover:opacity-80"
              />
            ),
            symbol: <span title="∅" />,
          }}
        />
        {" · "}
        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-4 hover:opacity-80"
        >
          {t("about.footer.sourceOnGithub")}
        </a>
        {" · "}
        <a
          href={LICENSE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-4 hover:opacity-80"
        >
          GPL-3.0
        </a>
      </div>
    </div>
  )
}
