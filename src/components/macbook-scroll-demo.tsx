import { MacbookScroll } from "@/components/ui/macbook-scroll";

export default function MacbookScrollDemo() {
  return (
    <main className="min-h-screen bg-white text-stone-950">
      <MacbookScroll
        title={
          <span>
            进入我的个人网站
            <br />
            向下滑动，让页面从屏幕里展开。
          </span>
        }
      />
    </main>
  );
}
