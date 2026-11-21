// Date wording for the guest pages. Kept apart from guest-parts so client components do not import server code.
export const when = (t: number | null | undefined) =>
  t ? new Date(t).toLocaleString("en-ZA", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
export const day = (t: number | null | undefined) =>
  t ? new Date(t).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }) : "";
