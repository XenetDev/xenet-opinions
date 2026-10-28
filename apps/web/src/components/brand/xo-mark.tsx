import type { ComponentProps } from 'react'

export function XoMark({ className, ...props }: ComponentProps<'svg'>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 300 138"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <g transform="translate(-242.25 -314.75)">
        <path d="M244.810 314.930 L298.269 386.994 L344.246 451.787 L378.461 451.787 L327.779 380.578 L375.039 314.930 L340.824 314.930 L310.674 356.842 L279.453 314.930 Z M275.180 400.893 L242.248 451.788 L275.180 451.788 L308.112 400.893 Z" />
        <path fillRule="evenodd" d="M472 314.75 a68.5 68.5 0 1 0 0.001 0 Z M472 342.2 a41.1 41.1 0 1 1 -0.001 0 Z" />
      </g>
    </svg>
  )
}
