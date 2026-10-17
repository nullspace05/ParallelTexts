import { setStoredHeaderHidden } from "@/lib/user-settings"
import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Header } from "./header"

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    className,
    onClick,
    "aria-label": ariaLabel,
    "aria-disabled": ariaDisabled,
  }: {
    to: string
    children: ReactNode
    className?: string
    onClick?: (event: React.MouseEvent) => void
    "aria-label"?: string
    "aria-disabled"?: boolean
  }) => (
    <a
      href={typeof to === "string" ? to : "/"}
      className={className}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-disabled={ariaDisabled || undefined}
    >
      {children}
    </a>
  ),
}))

afterEach(() => {
  localStorage.clear()
  setStoredHeaderHidden(false)
  document.body.innerHTML = ""
})

function getHeader(): HTMLElement {
  const header = document.querySelector("header")
  if (!header) throw new Error("header not found")
  return header
}

describe("Header click-to-hide", () => {
  it("slides the navbar up when the empty bar is clicked", () => {
    render(<Header />)
    const header = getHeader()

    fireEvent.click(header)

    expect(header.className).toContain("-translate-y-full")
    expect(header.getAttribute("aria-hidden")).toBe("true")
    expect(localStorage.getItem("pt:headerHidden")).toBe("1")
    expect(screen.getByRole("button", { name: "Show navigation" })).toBeTruthy()
  })

  it("does not hide when a nav link is clicked", () => {
    render(<Header />)

    fireEvent.click(screen.getByText("Books"))

    expect(getHeader().className).not.toContain("-translate-y-full")
    expect(localStorage.getItem("pt:headerHidden")).not.toBe("1")
  })

  it("shows the navbar again when the reserved top slot is clicked", () => {
    render(<Header />)
    const header = getHeader()
    fireEvent.click(header)

    fireEvent.click(screen.getByRole("button", { name: "Show navigation" }))

    expect(header.className).not.toContain("-translate-y-full")
    expect(header.getAttribute("aria-hidden")).toBe("false")
    expect(localStorage.getItem("pt:headerHidden")).toBe("0")
  })

  it("restores a stored hidden state on mount", () => {
    setStoredHeaderHidden(true)
    render(<Header />)

    expect(getHeader().className).toContain("-translate-y-full")
    expect(screen.getByRole("button", { name: "Show navigation" })).toBeTruthy()
  })
})
