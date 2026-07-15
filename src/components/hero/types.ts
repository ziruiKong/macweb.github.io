export type FloatingCardName =
  | "music"
  | "profile"
  | "todo"
  | "calendar"
  | "weather"
  | "focus"
  | "folder";

export type FloatingCardConfig = {
  className: string;
  floatClassName: string;
  parallaxX: number;
  parallaxY: number;
  parallaxRotate: number;
};

