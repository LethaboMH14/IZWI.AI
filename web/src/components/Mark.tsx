import Link from "next/link";

const bars = [6, 12, 20, 28, 16, 24, 10];

export function Mark({ href = "/", small = false }: { href?: string; small?: boolean }) {
  return (
    <Link href={href} className={"mark" + (small ? " mark-s" : "")} aria-label="IZWI AI home">
      <svg viewBox="0 0 34 28" aria-hidden="true">
        {bars.map((h, i) => (
          <rect key={i} x={i * 5} y={14 - h / 2} width="3" height={h} rx="1.5" />
        ))}
      </svg>
      <span>IZWI AI</span>
    </Link>
  );
}
