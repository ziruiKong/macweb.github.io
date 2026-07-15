type IconProps = {
  className?: string;
};

export const PlayIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path d="M8 5.5v13l10-6.5-10-6.5Z" fill="currentColor" />
  </svg>
);

export const PauseIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path d="M7.5 5h3v14h-3V5Zm6 0h3v14h-3V5Z" fill="currentColor" />
  </svg>
);

export const SkipBackIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path d="M6 5h2v14H6V5Zm3.5 7L18 5.8v12.4L9.5 12Z" fill="currentColor" />
  </svg>
);

export const SkipForwardIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path d="M16 5h2v14h-2V5ZM6 5.8 14.5 12 6 18.2V5.8Z" fill="currentColor" />
  </svg>
);

export const CheckIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path
      d="m6.5 12.4 3.2 3.2 7.8-8.1"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.4"
    />
  </svg>
);

export const VerifiedIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path
      d="m12 2.8 2.1 2 2.9-.2.8 2.8 2.4 1.7-1.1 2.7 1.1 2.7-2.4 1.7-.8 2.8-2.9-.2-2.1 2-2.1-2-2.9.2-.8-2.8-2.4-1.7 1.1-2.7-1.1-2.7 2.4-1.7.8-2.8 2.9.2 2.1-2Z"
      fill="currentColor"
    />
    <path
      d="m8.6 12.2 2.1 2.1 4.7-5"
      fill="none"
      stroke="white"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
  </svg>
);

export const PlusIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path
      d="M12 5v14M5 12h14"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.8"
    />
  </svg>
);

export const LocationIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path
      d="M12 21s6-5.2 6-11a6 6 0 0 0-12 0c0 5.8 6 11 6 11Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    />
    <path d="M12 12.3a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z" fill="currentColor" />
  </svg>
);

export const ArrowUpRightIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path
      d="M7 17 17 7m0 0H9m8 0v8"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
  </svg>
);

