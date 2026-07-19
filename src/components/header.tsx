import { GITHUB_REPO_URL } from "@/lib/site-links"
import {
  ArrowsLeftRight,
  Books,
  Gear,
  GithubLogo,
  Info,
} from "@phosphor-icons/react"
import { Link } from "@tanstack/react-router"

const navLinkClass =
  "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[status=active]:text-primary sm:gap-2 sm:px-3"

const iconLinkClass =
  "text-muted-foreground transition-colors hover:text-foreground"

export function Header() {
  return (
    <header className="flex items-center justify-between border-b bg-background px-4 py-3 sm:px-8">
      <div className="flex items-center gap-8 lg:gap-16">
        <Link to="/" className={`${iconLinkClass} flex items-center gap-2`}>
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
          <Link to="/books" className={navLinkClass}>
            <Books size={18} />
            <span className="hidden sm:inline">Books</span>
          </Link>
          <Link to="/alignments" className={navLinkClass}>
            <ArrowsLeftRight size={18} />
            <span className="hidden sm:inline">Alignments</span>
          </Link>
          <Link to="/about" className={navLinkClass}>
            <Info size={18} />
            <span className="hidden sm:inline">About</span>
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
          aria-label="View source on GitHub"
          className={iconLinkClass}
        >
          <GithubLogo size={22} weight="fill" />
        </a>
        <Link to="/settings" className={iconLinkClass}>
          <Gear size={22} />
        </Link>
      </div>
    </header>
  )
}
