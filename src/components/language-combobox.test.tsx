import { getModelLanguages, withSelectedCode } from "@/lib/model-languages"
import { fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { groupLanguageOptions, LanguageCombobox } from "./language-combobox"

const MPNET = "Xenova/paraphrase-multilingual-mpnet-base-v2"

// jsdom lacks ResizeObserver, which Base UI's positioner touches.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub)

afterEach(() => {
  document.body.innerHTML = ""
})

describe("groupLanguageOptions", () => {
  it("orders: und row, Popular group, then All languages", () => {
    const groups = groupLanguageOptions(getModelLanguages(MPNET))
    expect(groups.map((g) => g.value)).toEqual([
      "_",
      "Popular",
      "All languages",
    ])
    expect(groups[0].label).toBeNull()
    expect(groups[0].items).toEqual(["und"])
    // popular block, in POPULAR order
    expect(groups[1].items.slice(0, 3)).toEqual(["en", "es", "fr"])
  })

  it("drops the Popular group when no option is popular", () => {
    const groups = groupLanguageOptions([
      { code: "und", label: "Any / undetermined" },
      { code: "xx", label: "Xhosa-ish" },
    ])
    expect(groups.map((g) => g.value)).toEqual(["_", "All languages"])
  })

  it("keeps a withSelectedCode-appended code in All languages, sorted", () => {
    const opts = withSelectedCode(getModelLanguages(MPNET), "xx-fake")
    const all = groupLanguageOptions(opts).at(-1)!
    expect(all.items).toContain("xx-fake")
  })
})

describe("<LanguageCombobox />", () => {
  function Harness({ initial = "und" }: { initial?: string }) {
    const [value, setValue] = useState(initial)
    return (
      <LanguageCombobox
        label="Source language"
        value={value}
        onChange={setValue}
        options={getModelLanguages(MPNET)}
      />
    )
  }

  it("shows the und placeholder, no badge, until a real language is picked", () => {
    render(<Harness />)
    expect(screen.getByText("Any / undetermined")).toBeTruthy()
  })

  it("opens on trigger click and renders both group labels", () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole("combobox"))
    expect(screen.getByText("Popular")).toBeTruthy()
    expect(screen.getByText("All languages")).toBeTruthy()
  })

  it("filters the list by typed language name", () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole("combobox"))
    fireEvent.change(screen.getByPlaceholderText("Search language…"), {
      target: { value: "japan" },
    })
    expect(screen.getByText("Japanese")).toBeTruthy()
    expect(screen.queryByText("German")).toBeNull()
  })

  it("calls onChange with the code and shows its badge on select", () => {
    const onChange = vi.fn()
    render(
      <LanguageCombobox
        label="Source language"
        value="und"
        onChange={onChange}
        options={getModelLanguages(MPNET)}
      />
    )
    fireEvent.click(screen.getByRole("combobox"))
    fireEvent.click(screen.getByText("French"))
    expect(onChange).toHaveBeenCalledWith("fr")
  })

  it("renders a code the model doesn't list when it's the current value", () => {
    render(
      <LanguageCombobox
        label="Source language"
        value="xx-fake"
        onChange={() => {}}
        options={withSelectedCode(getModelLanguages(MPNET), "xx-fake")}
      />
    )
    // falls back to the raw code as its label
    expect(screen.getByText("xx-fake")).toBeTruthy()
  })
})
