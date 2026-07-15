"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { LeftSiteRail } from "@/components/hero/left-site-rail";
import { BackgroundGradientAnimation } from "@/components/ui/background-gradient-animation";

const assetPath = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;

type MacbookScrollProps = {
  title?: React.ReactNode;
  badge?: React.ReactNode;
};

export const MacbookScroll = (props: MacbookScrollProps) => {
  void props;
  const sectionRef = useRef<HTMLElement>(null);
  const screenPanelRef = useRef<HTMLDivElement>(null);
  const targetProgressRef = useRef(0);
  const currentProgressRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [screenOff, setScreenOff] = useState(false);
  const [nightMode, setNightMode] = useState(true);
  const [viewport, setViewport] = useState({ width: 1440, height: 900 });
  const [screenRect, setScreenRect] = useState({
    left: 320,
    top: 180,
    width: 800,
    height: 300,
  });

  useEffect(() => {
    const animate = () => {
      const nextProgress = lerp(
        currentProgressRef.current,
        targetProgressRef.current,
        0.13,
      );

      currentProgressRef.current = nextProgress;
      setProgress(nextProgress);

      if (Math.abs(nextProgress - targetProgressRef.current) > 0.001) {
        rafRef.current = window.requestAnimationFrame(animate);
      } else {
        currentProgressRef.current = targetProgressRef.current;
        setProgress(targetProgressRef.current);
        rafRef.current = null;
      }
    };

    const requestAnimate = () => {
      if (rafRef.current === null) {
        rafRef.current = window.requestAnimationFrame(animate);
      }
    };

    const update = () => {
      const section = sectionRef.current;
      const panel = screenPanelRef.current;
      if (!section || !panel) return;

      const sectionRect = section.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const scrollable = sectionRect.height - window.innerHeight;

      setViewport({ width: window.innerWidth, height: window.innerHeight });
      setScreenRect({
        left: panelRect.left,
        top: panelRect.top,
        width: panelRect.width,
        height: panelRect.height,
      });
      targetProgressRef.current = clamp(-sectionRect.top / Math.max(scrollable, 1));
      requestAnimate();
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!screenOff) return;

    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    const preventScroll = (event: Event) => event.preventDefault();
    const preventScrollKeys = (event: KeyboardEvent) => {
      if (
        [
          " ",
          "ArrowDown",
          "ArrowUp",
          "PageDown",
          "PageUp",
          "Home",
          "End",
        ].includes(event.key)
      ) {
        event.preventDefault();
      }
    };

    window.scrollTo({ top: 0, left: 0 });
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    window.addEventListener("wheel", preventScroll, { passive: false });
    window.addEventListener("touchmove", preventScroll, { passive: false });
    window.addEventListener("keydown", preventScrollKeys);

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("wheel", preventScroll);
      window.removeEventListener("touchmove", preventScroll);
      window.removeEventListener("keydown", preventScrollKeys);
    };
  }, [screenOff]);

  const detach = smootherstep(clamp((progress - 0.08) / 0.22));
  const expand = smootherstep(clamp((progress - 0.26) / 0.42));
  const hardwareOpacity = clamp(1 - smootherstep(clamp((progress - 0.5) / 0.3)));
  const screenContentOpacity = progress < 0.08 ? 1 : 0;
  const floatingContentOpacity = smootherstep(clamp((progress - 0.09) / 0.14));
  const detachedWidth = Math.min(
    Math.max(screenRect.width * 1.08, screenRect.height * 1.6),
    viewport.width * 0.84,
  );
  const detachedHeight = detachedWidth / 1.6;
  const detachedLeft = screenRect.left + (screenRect.width - detachedWidth) / 2;
  const detachedTop = screenRect.top + screenRect.height * 0.42;
  const panelLeft = lerp(lerp(screenRect.left, detachedLeft, detach), -1, expand);
  const panelTop = lerp(lerp(screenRect.top, detachedTop, detach), -1, expand);
  const panelWidth = lerp(
    lerp(screenRect.width, detachedWidth, detach),
    viewport.width + 2,
    expand,
  );
  const panelHeight = lerp(
    lerp(screenRect.height, detachedHeight, detach),
    viewport.height + 2,
    expand,
  );
  const panelRadius = lerp(lerp(13, 18, detach), 0, expand);
  const panelShadow = lerp(lerp(18, 42, detach), 0, expand);
  const panelRotate = lerp(-9, 0, expand);
  const panelLift = lerp(0, -28, expand);
  const isFullscreen = expand > 0.985;
  const openHomepage = () => {
    if (!isFullscreen) return;

    window.location.href = "https://ziruikong.github.io/index.html";
  };

  return (
    <section
      ref={sectionRef}
      className={
        nightMode
          ? "cursor-magnetic-zone relative h-[240vh] bg-[#06111f]"
          : "cursor-magnetic-zone relative h-[240vh] bg-white"
      }
    >
      <CustomCursor />
      <LeftSiteRail hidden={progress > 0.02 || screenOff} />
      <div
        className={[
          "fixed top-5 right-5 z-30 transition duration-200",
          progress > 0.02 ? "pointer-events-none opacity-0" : "opacity-100",
        ].join(" ")}
      >
        <input
          id="checkboxInput"
          type="checkbox"
          checked={nightMode}
          onChange={(event) => setNightMode(event.target.checked)}
        />
        <label
          className="toggleSwitch"
          htmlFor="checkboxInput"
          aria-label="Toggle night background"
          data-cursor-target
        />
      </div>
      <div className="sticky top-0 h-screen overflow-hidden">
        <BackgroundGradientAnimation
          containerClassName="pointer-events-none absolute inset-0 z-0"
          gradientBackgroundStart={nightMode ? "rgb(3, 12, 28)" : "rgb(255, 255, 255)"}
          gradientBackgroundEnd={nightMode ? "rgb(5, 31, 48)" : "rgb(255, 255, 255)"}
          firstColor={nightMode ? "0, 110, 255" : "32, 169, 255"}
          secondColor={nightMode ? "0, 225, 255" : "0, 219, 255"}
          thirdColor={nightMode ? "38, 255, 214" : "50, 230, 208"}
          fourthColor={nightMode ? "40, 72, 190" : "88, 128, 255"}
          fifthColor={nightMode ? "180, 80, 255" : "255, 120, 230"}
          pointerColor={nightMode ? "0, 220, 255" : "0, 200, 255"}
          size="96%"
          blendingValue="screen"
          interactive={false}
        />
        <div
          className="grid h-full place-items-center px-4 py-8"
          style={{ opacity: hardwareOpacity }}
        >
          <div className="relative h-[420px] w-full sm:h-[620px] md:h-[720px]">
            <div className="absolute left-1/2 top-1/2 h-[940px] w-[1040px] origin-center -translate-x-1/2 -translate-y-[52%] scale-[0.36] sm:-translate-y-[60%] sm:scale-[0.52] md:-translate-y-[64%] md:scale-[0.62] xl:scale-[0.7]">
              <Screen
                panelRef={screenPanelRef}
                contentOpacity={screenContentOpacity}
                screenOff={screenOff}
              />
              <Hinge />
              <Base
                onPowerToggle={() => setScreenOff((current) => !current)}
                screenOff={screenOff}
              />
            </div>
          </div>
        </div>

        <div
          className="fixed z-40 overflow-hidden bg-[#10131d] will-change-transform"
          data-animated-panel
          data-cursor-target={isFullscreen ? true : undefined}
          role={isFullscreen ? "link" : undefined}
          tabIndex={isFullscreen ? 0 : -1}
          aria-label={isFullscreen ? "Enter homepage" : undefined}
          onClick={openHomepage}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openHomepage();
            }
          }}
          style={{
            left: isFullscreen ? -4 : panelLeft,
            top: isFullscreen ? -4 : panelTop,
            width: isFullscreen ? "calc(100vw + 8px)" : panelWidth,
            height: isFullscreen ? "calc(100dvh + 8px)" : panelHeight,
            borderRadius: isFullscreen ? 0 : panelRadius,
            opacity: floatingContentOpacity,
            pointerEvents: isFullscreen ? "auto" : "none",
            transform: isFullscreen
              ? "none"
              : `perspective(1200px) translateY(${panelLift}px) rotateX(${panelRotate}deg)`,
            transformOrigin: "center top",
            boxShadow: isFullscreen
              ? "none"
              : `0 ${panelShadow}px ${panelShadow * 3.2}px rgba(15,23,42,0.22)`,
          }}
        >
          <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(105deg,rgba(255,255,255,0.12),transparent_24%,transparent_72%,rgba(255,255,255,0.05))]" />
          <LockScreenMock screenOff={screenOff} />
        </div>
      </div>
    </section>
  );
};

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

const lerp = (from: number, to: number, progress: number) =>
  from + (to - from) * progress;

const smootherstep = (value: number) =>
  value * value * value * (value * (value * 6 - 15) + 10);

const CustomCursor = () => {
  const cursorElementRef = useRef<HTMLDivElement | null>(null);
  const pointedElementRef = useRef<Element | null>(null);
  const cursorFrameRef = useRef<number | null>(null);
  const cursorStateRef = useRef({
    x: -80,
    y: -80,
    scale: 1,
  });

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const cursorElement = cursorElementRef.current;
    if (!cursorElement) return;

    const targetSelector = [
      ".cursor-magnetic-zone [data-cursor-target]",
      ".cursor-magnetic-zone button",
      ".cursor-magnetic-zone .toggleSwitch",
      ".cursor-magnetic-zone [data-key]",
    ].join(", ");

    const renderCursor = () => {
      cursorFrameRef.current = null;
      const { x, y, scale } = cursorStateRef.current;
      cursorElement.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${scale})`;
    };

    const scheduleCursorRender = () => {
      if (cursorFrameRef.current !== null) return;
      cursorFrameRef.current = window.requestAnimationFrame(renderCursor);
    };

    const clearPointedElement = () => {
      pointedElementRef.current?.classList.remove("cursor-pointed");
      pointedElementRef.current = null;
    };

    const handlePointerMove = (event: PointerEvent) => {
      const coalescedEvents = event.getCoalescedEvents?.() ?? [event];
      const latestEvent = coalescedEvents[coalescedEvents.length - 1] ?? event;
      const target = event.target instanceof Element
        ? event.target.closest(targetSelector)
        : null;

      if (target !== pointedElementRef.current) {
        clearPointedElement();
        pointedElementRef.current = target;
        pointedElementRef.current?.classList.add("cursor-pointed");
      }

      cursorStateRef.current = {
        x: latestEvent.clientX,
        y: latestEvent.clientY,
        scale: target ? 2.15 : 1,
      };
      cursorElement.style.opacity = "1";
      scheduleCursorRender();
    };

    const handlePointerLeave = () => {
      clearPointedElement();
      cursorElement.style.opacity = "0";
      cursorStateRef.current.scale = 1;
      scheduleCursorRender();
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerleave", handlePointerLeave);
    window.addEventListener("blur", handlePointerLeave);

    return () => {
      clearPointedElement();
      if (cursorFrameRef.current !== null) {
        window.cancelAnimationFrame(cursorFrameRef.current);
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("blur", handlePointerLeave);
    };
  }, []);

  return (
    <div
      ref={cursorElementRef}
      className="pointer-events-none fixed left-0 top-0 z-[121] hidden h-2.5 w-2.5 rounded-full bg-white opacity-0 mix-blend-difference shadow-[0_0_14px_rgba(255,255,255,0.9)] transition-opacity duration-100 ease-out will-change-transform md:block"
      style={{
        transform: "translate3d(-80px, -80px, 0) translate(-50%, -50%)",
      }}
    />
  );
};

const Hinge = () => (
  <div
    className="absolute left-1/2 top-[530px] z-20 h-[50px] w-[700px] -translate-x-1/2 bg-black"
    data-hinge
  />
);

const Screen = ({
  panelRef,
  contentOpacity,
  screenOff,
}: {
  panelRef: React.RefObject<HTMLDivElement | null>;
  contentOpacity: number;
  screenOff: boolean;
}) => {
  return (
    <div
      className="absolute left-[90px] top-[24px] z-30 h-[538px] w-[860px] rounded-[18px] bg-[#070707] p-[8px] shadow-[0_24px_60px_rgba(0,0,0,0.22)]"
      data-screen
      style={{
        transform: "perspective(950px) rotateX(-23deg) scaleY(0.62)",
        transformOrigin: "bottom center",
      }}
    >
      <div
        ref={panelRef}
        className="relative h-full w-full overflow-hidden rounded-[13px] border border-white/5 bg-[#10131d] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
      >
        <div className="pointer-events-none absolute inset-0 z-10 rounded-[13px] bg-[linear-gradient(105deg,rgba(255,255,255,0.12),transparent_24%,transparent_72%,rgba(255,255,255,0.05))]" />
        <div className="h-full w-full" style={{ opacity: contentOpacity }}>
          <LockScreenMock screenOff={screenOff} />
        </div>
      </div>
    </div>
  );
};

const Base = ({
  onPowerToggle,
  screenOff,
}: {
  onPowerToggle: () => void;
  screenOff: boolean;
}) => {
  return (
    <div
      className="absolute left-[90px] top-[556px] z-10 h-[538px] w-[860px] overflow-visible bg-[#e6e8eb] shadow-[0_28px_50px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.98)]"
      data-base
      style={{
        borderRadius: "28px 28px 34px 34px",
        background:
          "linear-gradient(180deg, #edf0f3 0%, #e4e7eb 46%, #dfe3e8 100%)",
      }}
    >
      <div className="absolute left-[2px] top-[78px] h-[240px] w-[82px]" data-speaker="left">
        <SpeakerGrid />
      </div>
      <div className="absolute right-[2px] top-[78px] h-[240px] w-[82px]" data-speaker="right">
        <SpeakerGrid />
      </div>

      <div className="absolute left-1/2 top-[70px] w-[690px] -translate-x-1/2" data-keyboard-shell>
        <Keyboard onPowerToggle={onPowerToggle} screenOff={screenOff} />
      </div>

      <div
        className="absolute bottom-[42px] left-1/2 h-[148px] w-[372px] -translate-x-1/2 rounded-[22px] border border-black/10 bg-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),inset_0_0_16px_rgba(0,0,0,0.055)]"
        data-trackpad
      />
      <div
        className="absolute bottom-0 left-1/2 h-[13px] w-[124px] -translate-x-1/2 rounded-t-[22px] bg-black"
        data-front-notch
      />
      <PeerlistBadge />
      <GeorgiaSticker />
      <HandshakeSticker />
      <MessiSticker />
      <BearSticker />
    </div>
  );
};

const LockScreenMock = ({ screenOff }: { screenOff: boolean }) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const dateText = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(now);
  const timeText = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#68aee3] text-white">
      <div
        className={[
          "absolute inset-0 z-30 bg-black transition-opacity duration-300",
          screenOff ? "opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
      />
      <picture className="absolute inset-0 block h-full w-full">
        <source
          srcSet={assetPath("/glacial-blue-wallpaper-1280.webp")}
          media="(max-width: 767px)"
          type="image/webp"
        />
        <source
          srcSet={assetPath("/glacial-blue-wallpaper-1920.webp")}
          media="(max-width: 1439px)"
          type="image/webp"
        />
        <source srcSet={assetPath("/glacial-blue-wallpaper-2560.webp")} type="image/webp" />
        <img
          className="h-full w-full object-cover"
          src={assetPath("/glacial-blue-wallpaper-1920.webp")}
          alt=""
          decoding="async"
          fetchPriority="high"
        />
      </picture>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,20,48,0.28),rgba(8,20,48,0.03)_30%,rgba(0,0,0,0.30)_100%)]" />

      <div className="absolute left-1/2 top-[9%] -translate-x-1/2 text-center drop-shadow-[0_2px_10px_rgba(11,34,76,0.24)]">
        <div className="text-[clamp(10px,2.2vw,18px)] font-semibold leading-none text-white/86">
          {dateText}
        </div>
        <div className="mt-1 text-[clamp(42px,9vw,96px)] font-bold leading-[0.92] tracking-[-0.06em] text-white/78">
          {timeText}
        </div>
      </div>

      <div className="absolute bottom-[5%] left-1/2 flex -translate-x-1/2 flex-col items-center text-center drop-shadow-[0_1px_8px_rgba(5,20,50,0.32)]">
        <div className="relative h-[clamp(28px,5.8vw,56px)] w-[clamp(28px,5.8vw,56px)] overflow-hidden rounded-full bg-white/20 shadow-[0_4px_14px_rgba(5,20,50,0.24)]">
          <Image
            src={assetPath("/profile-avatar-small.jpg")}
            alt="Zirui Kong profile photo"
            fill
            sizes="56px"
            className="object-cover object-[50%_34%]"
          />
        </div>
        <div className="mt-2 text-[clamp(8px,1.5vw,14px)] font-semibold text-white/92">
          Zirui Kong
        </div>
      </div>
    </div>
  );
};

const PeerlistBadge = () => (
  <StickerWithHoverCard
    src={assetPath("/ohio-sticker-small.png")}
    alt="Ohio mascot sticker"
    width={92}
    height={92}
    containerClassName="bottom-[22px] left-[24px] h-[84px] w-[84px]"
    imageClassName="rotate-[-7deg]"
    cardClassName="left-0 bottom-[calc(100%+10px)]"
    title="Ohio State Brutus"
    subtitle="Where It All Began"
    description="My Undergraduate Journey. Brutus Buckeye is the iconic mascot of The Ohio State University. This sticker commemorates my undergraduate years and the beginning of my academic journey, where I studied economics and developed my interest in data analysis, research, and interdisciplinary exploration."
  />
);

const GeorgiaSticker = () => (
  <StickerWithHoverCard
    src={assetPath("/georgia-sticker-small.png")}
    alt="Georgia logo sticker"
    width={118}
    height={103}
    containerClassName="bottom-[10px] left-[118px] h-[82px] w-[96px]"
    imageClassName="rotate-[5deg]"
    cardClassName="left-1/2 bottom-[calc(100%+10px)] -translate-x-1/2"
    title="CH Logo"
    subtitle="Music & Identity"
    description="A Personal Soundtrack. This logo comes from the personal brand of Xie Di, my favorite rapper. Music has always carried emotion, identity, and different stages of my life. This sticker represents my love for Chinese rap culture and the sounds that shaped how I think and express myself."
  />
);

const HandshakeSticker = () => (
  <StickerWithHoverCard
    src={assetPath("/zirui-sticker-small.png")}
    alt="Arsenal handshake sticker"
    width={82}
    height={82}
    containerClassName="bottom-[112px] left-[108px] h-[78px] w-[78px]"
    imageClassName="rotate-[9deg]"
    cardClassName="left-1/2 bottom-[calc(100%+10px)] -translate-x-1/2"
    title="Arsenal Handshake"
    subtitle="Passion & Unity"
    description="My Club. My Community. This sticker combines the Arsenal crest with a handshake, representing my love for football and the sense of connection it creates. Arsenal is more than a team to me: it stands for creativity, persistence, and team spirit. The handshake symbolizes trust, collaboration, and shared growth."
  />
);

const MessiSticker = () => (
  <StickerWithHoverCard
    src={assetPath("/messi-sticker-small.png")}
    alt="Messi world cup sticker"
    width={104}
    height={128}
    containerClassName="right-[134px] bottom-[34px] h-[112px] w-[91px]"
    imageClassName="rotate-[7deg]"
    cardClassName="right-[-28px] bottom-[calc(100%+10px)]"
    title="Messi 2022"
    subtitle="The Pursuit of Greatness"
    description="The Dream Finally Realized. Messi lifting the World Cup is one of football's most symbolic moments. It represents not only victory, but the long process of persistence, setbacks, and finally realizing a dream. His focus, humility, and pursuit of excellence are qualities I hope to carry into my own growth and academic exploration."
  />
);

const BearSticker = () => (
  <StickerWithHoverCard
    src={assetPath("/bear-sticker-small.png")}
    alt="Bear sweater sticker"
    width={92}
    height={126}
    containerClassName="right-[30px] bottom-[26px] h-[126px] w-[92px]"
    imageClassName="rotate-[-6deg]"
    cardClassName="right-0 bottom-[calc(100%+10px)]"
    title="Columbia Bear"
    subtitle="The Next Chapter"
    description="A New Beginning. The Columbia bear represents the new chapter I am about to begin: a new environment, new challenges, and future exploration in data science, statistical analysis, and interdisciplinary research. From Ohio State to Columbia, this is not only a change of school, but the next step in my personal growth."
  />
);

const StickerWithHoverCard = ({
  src,
  alt,
  width,
  height,
  containerClassName,
  imageClassName,
  cardClassName,
  title,
  subtitle,
  description,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  containerClassName: string;
  imageClassName: string;
  cardClassName: string;
  title: string;
  subtitle: string;
  description: string;
}) => (
  <div
    className={`group absolute z-30 hover:z-[90] ${containerClassName}`}
    data-cursor-target
    data-sticker
  >
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={`h-full w-full object-contain drop-shadow-[0_16px_24px_rgba(15,23,42,0.20)] transition duration-200 ease-out group-hover:scale-110 ${imageClassName}`}
    />
    <div
      className={`pointer-events-none absolute z-[100] w-[270px] rounded-[10px] border border-white/55 bg-white/86 p-3 text-left text-slate-800 opacity-0 shadow-[0_18px_44px_rgba(15,23,42,0.22)] backdrop-blur-xl transition duration-200 ease-out group-hover:-translate-y-1 group-hover:opacity-100 ${cardClassName}`}
    >
      <div className="text-[12px] font-bold leading-tight text-slate-950">
        {title}
      </div>
      <div className="mt-0.5 text-[10px] font-semibold leading-tight text-cyan-700">
        {subtitle}
      </div>
      <div className="mt-1.5 text-[9.5px] font-medium leading-snug text-slate-600">
        {description}
      </div>
    </div>
  </div>
);

const SpeakerGrid = () => (
  <div
    className="h-full w-full opacity-70"
    style={{
      backgroundImage:
        "radial-gradient(circle, rgba(17,24,39,0.85) 0.48px, transparent 0.58px)",
      backgroundSize: "4px 4px",
    }}
  />
);

const Keyboard = ({
  onPowerToggle,
  screenOff,
}: {
  onPowerToggle: () => void;
  screenOff: boolean;
}) => {
  const rows = [
    ["esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F10", "F11", "F12", "touch-id"],
    ["~", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "+", "del"],
    ["tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\"],
    ["caps", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "return"],
    ["shift", "Z", "X", "C", "V", "B", "N", "M", "<", ">", "/", "shift"],
    ["fn", "control", "option", "command", "space", "command", "option", "<", "v", ">"],
  ];
  const audioContextRef = useRef<AudioContext | null>(null);
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(() => new Set());

  const playKeySound = useCallback(() => {
    const AudioContextConstructor = window.AudioContext;
    const context = audioContextRef.current ?? new AudioContextConstructor();
    audioContextRef.current = context;

    if (context.state === "suspended") {
      void context.resume();
    }

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const clickOscillator = context.createOscillator();
    const gain = context.createGain();
    const clickGain = context.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(420, now);
    oscillator.frequency.exponentialRampToValueAtTime(170, now + 0.018);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.032);

    clickOscillator.type = "triangle";
    clickOscillator.frequency.setValueAtTime(1800, now);
    clickOscillator.frequency.exponentialRampToValueAtTime(760, now + 0.012);
    clickGain.gain.setValueAtTime(0.0001, now);
    clickGain.gain.exponentialRampToValueAtTime(0.08, now + 0.001);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);

    oscillator.connect(gain);
    gain.connect(context.destination);
    clickOscillator.connect(clickGain);
    clickGain.connect(context.destination);
    oscillator.start(now);
    clickOscillator.start(now);
    oscillator.stop(now + 0.04);
    clickOscillator.stop(now + 0.02);
  }, []);

  const playPowerSound = useCallback(() => {
    const AudioContextConstructor = window.AudioContext;
    const context = audioContextRef.current ?? new AudioContextConstructor();
    audioContextRef.current = context;

    if (context.state === "suspended") {
      void context.resume();
    }

    const now = context.currentTime;
    const shimmer = context.createOscillator();
    const chime = context.createOscillator();
    const shimmerGain = context.createGain();
    const chimeGain = context.createGain();

    shimmer.type = "triangle";
    shimmer.frequency.setValueAtTime(1480, now);
    shimmer.frequency.exponentialRampToValueAtTime(1080, now + 0.028);
    shimmerGain.gain.setValueAtTime(0.0001, now);
    shimmerGain.gain.exponentialRampToValueAtTime(0.11, now + 0.003);
    shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

    chime.type = "sine";
    chime.frequency.setValueAtTime(523.25, now + 0.012);
    chime.frequency.exponentialRampToValueAtTime(783.99, now + 0.1);
    chimeGain.gain.setValueAtTime(0.0001, now + 0.012);
    chimeGain.gain.exponentialRampToValueAtTime(0.13, now + 0.025);
    chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    shimmer.connect(shimmerGain);
    chime.connect(chimeGain);
    shimmerGain.connect(context.destination);
    chimeGain.connect(context.destination);
    shimmer.start(now);
    chime.start(now + 0.012);
    shimmer.stop(now + 0.06);
    chime.stop(now + 0.19);
  }, []);

  const pressKey = useCallback((keyId: string, playSound = true) => {
    if (playSound) {
      playKeySound();
    }
    
    setPressedKeys((current) => {
      const next = new Set(current);
      next.add(keyId);
      return next;
    });
  }, [playKeySound]);

  const pressPowerKey = useCallback((keyId: string) => {
    playPowerSound();
    setPressedKeys((current) => {
      const next = new Set(current);
      next.add(keyId);
      return next;
    });
  }, [playPowerSound]);

  const pressPhysicalKey = useCallback((keyId: string) => {
    if (screenOff) return;

    playKeySound();
    setPressedKeys((current) => {
      const next = new Set(current);
      next.add(keyId);
      return next;
    });
  }, [playKeySound, screenOff]);

  const releaseKey = useCallback((keyId: string) => {
    setPressedKeys((current) => {
      const next = new Set(current);
      next.delete(keyId);
      return next;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const keyId = getKeyboardKeyId(event.code);
      if (!keyId || event.repeat) return;

      pressPhysicalKey(keyId);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const keyId = getKeyboardKeyId(event.code);
      if (!keyId) return;

      releaseKey(keyId);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [pressPhysicalKey, releaseKey]);

  return (
    <div className="space-y-[4px] rounded-[12px] bg-black/20 p-[7px]">
      {rows.map((row, rowIndex) => (
        <div className="flex justify-center gap-[4px]" key={`${rowIndex}-${row.length}`}>
          {row.map((key, keyIndex) => {
            const keyId = `${rowIndex}-${key}-${keyIndex}`;
            const isTouchId = key === "touch-id";
            const isEnter = key === "return";
            const isPressed = pressedKeys.has(keyId);

            return (
              <button
                type="button"
                className={[
                  "grid h-[34px] min-w-[34px] place-items-center rounded-[7px] px-1.5 text-center text-[8px] font-semibold leading-tight transition duration-75 ease-out focus:outline-none",
                  isTouchId
                    ? "bg-black text-slate-400 shadow-[inset_0_-1px_0_rgba(255,255,255,0.16),inset_0_1px_0_rgba(255,255,255,0.08),0_0_7px_rgba(0,0,0,0.42)]"
                    : isEnter
                      ? "bg-black text-white shadow-[inset_0_-1px_0_rgba(255,255,255,0.18),inset_0_1px_0_rgba(255,255,255,0.08),0_0_7px_rgba(0,0,0,0.34)]"
                    : "bg-[#050507] text-white shadow-[inset_0_-1px_0_rgba(255,255,255,0.16),inset_0_1px_0_rgba(255,255,255,0.10),0_0_6px_rgba(255,255,255,0.10)]",
                  isPressed
                    ? "translate-y-[1px] scale-[0.96] shadow-[inset_0_1px_4px_rgba(0,0,0,0.35)]"
                    : "",
                ].join(" ")}
                aria-label={isTouchId ? "Touch ID" : key === "space" ? "space" : key}
                data-key
                  key={keyId}
                onClick={() => {
                  if (isTouchId) {
                    onPowerToggle();
                  }
                }}
                onPointerDown={() => {
                  if (isTouchId) {
                    pressPowerKey(keyId);
                    return;
                  }

                  if (!screenOff) {
                    pressKey(keyId);
                  }
                }}
                onPointerUp={() => releaseKey(keyId)}
                onPointerCancel={() => releaseKey(keyId)}
                onPointerLeave={() => releaseKey(keyId)}
                onBlur={() => releaseKey(keyId)}
                style={{
                  flex:
                    key === "space"
                      ? "5.2 1 0"
                      : ["del", "tab", "caps", "return", "shift"].includes(key)
                        ? "1.8 1 0"
                        : ["control", "option", "command"].includes(key)
                          ? "1.35 1 0"
                          : "1 1 0",
                }}
              >
                {isTouchId ? (
                  <span
                    className={[
                      "block h-[24px] w-[24px] rounded-full border-[3px] transition-colors",
                      screenOff ? "border-[#8c8c8c]" : "border-[#d8d8d8]",
                    ].join(" ")}
                  />
                ) : key === "space" ? null : (
                  key
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};

const getKeyboardKeyId = (code: string) => {
  const keyIds: Record<string, string> = {
    Escape: "0-esc-0",
    F1: "0-F1-1",
    F2: "0-F2-2",
    F3: "0-F3-3",
    F4: "0-F4-4",
    F5: "0-F5-5",
    F6: "0-F6-6",
    F7: "0-F7-7",
    F8: "0-F8-8",
    F10: "0-F10-9",
    F11: "0-F11-10",
    F12: "0-F12-11",
    Backquote: "1-~-0",
    Digit1: "1-1-1",
    Digit2: "1-2-2",
    Digit3: "1-3-3",
    Digit4: "1-4-4",
    Digit5: "1-5-5",
    Digit6: "1-6-6",
    Digit7: "1-7-7",
    Digit8: "1-8-8",
    Digit9: "1-9-9",
    Digit0: "1-0-10",
    Minus: "1---11",
    Equal: "1-+-12",
    Backspace: "1-del-13",
    Tab: "2-tab-0",
    KeyQ: "2-Q-1",
    KeyW: "2-W-2",
    KeyE: "2-E-3",
    KeyR: "2-R-4",
    KeyT: "2-T-5",
    KeyY: "2-Y-6",
    KeyU: "2-U-7",
    KeyI: "2-I-8",
    KeyO: "2-O-9",
    KeyP: "2-P-10",
    BracketLeft: "2-[-11",
    BracketRight: "2-]-12",
    Backslash: "2-\\-13",
    CapsLock: "3-caps-0",
    KeyA: "3-A-1",
    KeyS: "3-S-2",
    KeyD: "3-D-3",
    KeyF: "3-F-4",
    KeyG: "3-G-5",
    KeyH: "3-H-6",
    KeyJ: "3-J-7",
    KeyK: "3-K-8",
    KeyL: "3-L-9",
    Semicolon: "3-;-10",
    Quote: "3-'-11",
    Enter: "3-return-12",
    ShiftLeft: "4-shift-0",
    KeyZ: "4-Z-1",
    KeyX: "4-X-2",
    KeyC: "4-C-3",
    KeyV: "4-V-4",
    KeyB: "4-B-5",
    KeyN: "4-N-6",
    KeyM: "4-M-7",
    Comma: "4-<-8",
    Period: "4->-9",
    Slash: "4-/-10",
    ShiftRight: "4-shift-11",
    ControlLeft: "5-control-1",
    AltLeft: "5-option-2",
    MetaLeft: "5-command-3",
    Space: "5-space-4",
    MetaRight: "5-command-5",
    AltRight: "5-option-6",
    ArrowLeft: "5-<-7",
    ArrowDown: "5-v-8",
    ArrowRight: "5->-9",
  };

  return keyIds[code] ?? null;
};
