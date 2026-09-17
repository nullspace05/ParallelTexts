import { GITHUB_REPO_URL } from "@/lib/site-links"
import {
  ArrowsLeftRightIcon,
  BooksIcon,
  GearIcon,
  GithubLogoIcon,
  InfoIcon,
} from "@phosphor-icons/react"
import { Link } from "@tanstack/react-router"
import { type MouseEvent, useSyncExternalStore } from "react"
import { useTranslation } from "react-i18next"
import {
  getActiveModelDownloadId,
  subscribeToModelDownloads,
} from "@/utils/model-download-state"

const navLinkClass =
  "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[status=active]:text-primary sm:gap-2 sm:px-3"

const iconLinkClass =
  "text-muted-foreground transition-colors hover:text-foreground"

export function Header() {
  const { t } = useTranslation()
  const activeDownloadId = useSyncExternalStore(
    subscribeToModelDownloads,
    getActiveModelDownloadId,
    getActiveModelDownloadId
  )
  const isDownloading = activeDownloadId !== null
  const preventNavigation = (event: MouseEvent) => {
    if (isDownloading) event.preventDefault()
  }
  const disabledClass = isDownloading
    ? "pointer-events-none cursor-not-allowed opacity-45"
    : ""

  return (
    <header className="flex items-center justify-between border-b bg-background px-4 py-3 sm:px-8">
      <div className="flex items-center gap-8 lg:gap-16">
        <Link
          to="/"
          onClick={preventNavigation}
          aria-disabled={isDownloading}
          className={`${iconLinkClass} flex items-center gap-2 ${disabledClass}`}
        >
          <img
            src="/favicon.svg"
            alt=""
            className="size-[22px] shrink-0 rounded-sm"
          />
          <span className="text-sm font-semibold tracking-tight">
            ParallelTexts
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            to="/books"
            onClick={preventNavigation}
            aria-disabled={isDownloading}
            className={`${navLinkClass} ${disabledClass}`}
          >
            <BooksIcon size={18} />
            <span className="hidden sm:inline">{t("header.books")}</span>
          </Link>
          <Link
            to="/alignments"
            onClick={preventNavigation}
            aria-disabled={isDownloading}
            className={`${navLinkClass} ${disabledClass}`}
          >
            <ArrowsLeftRightIcon size={18} />
            <span className="hidden sm:inline">{t("header.alignments")}</span>
          </Link>
          <Link
            to="/about"
            onClick={preventNavigation}
            aria-disabled={isDownloading}
            className={`${navLinkClass} ${disabledClass}`}
          >
            <InfoIcon size={18} />
            <span className="hidden sm:inline">{t("header.about")}</span>
          </Link>
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden font-mono text-xs text-muted-foreground/50 sm:inline">
          {__COMMIT_HASH__}
        </span>
        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("header.github")}
          className={iconLinkClass}
        >
          <GithubLogoIcon size={22} weight="fill" />
        </a>
        <Link
          to="/settings"
          onClick={preventNavigation}
          aria-disabled={isDownloading}
          className={`${iconLinkClass} ${disabledClass}`}
          aria-label={t("header.settings")}
        >
          <GearIcon size={22} />
        </Link>
      </div>
    </header>
  )
}
