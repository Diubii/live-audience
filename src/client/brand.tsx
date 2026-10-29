import logo from "./assets/logo.svg"
import { cx } from "./ui.tsx"

/** The look of the presentation: Blue State and gold, the logo and its wordmark. */

/** Logo and "Quiz", plus what this part of the app is. */
export function Wordmark({ suffix, className }: { suffix?: string; className?: string }) {
  return (
    <span className={cx("flex items-center gap-2.5", className)}>
      <img src={logo} alt="" className="size-8" />
      <span className="font-display text-lg leading-none font-bold text-pn">Quiz</span>
      {suffix && (
        <span className="kicker border-l border-pn/30 pl-2.5 leading-none tracking-[0.18em]">{suffix}</span>
      )}
    </span>
  )
}

/** The logo inside slowly turning glass rings. */
export function Orbit({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cx("orbit", className)}>
      <span className="ring r1" />
      <span className="ring r2" />
      <span className="ring r3" />
      <img src={logo} alt="" />
    </div>
  )
}
