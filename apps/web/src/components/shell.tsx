"use client";

import { brand } from "@club/ui";
import { Bell, CircleDot, House, LayoutGrid, Plus, Trophy, UserRound, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/use-resource";

const items = [
  { href: "/", label: "Ana Sayfa", icon: House },
  { href: "/oyna", label: "Oyna", icon: CircleDot },
  { href: "/kortlar", label: "Kortlar", icon: LayoutGrid },
  { href: "/turnuvalar", label: "Turnuvalar", icon: Trophy },
  { href: "/oyuncular", label: "Oyuncular", icon: Users },
  { href: "/profil", label: "Profil", icon: UserRound },
];

type InstallPrompt = Event & { prompt: () => Promise<void> };

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, offline } = useAuth();
  const notes = useResource<{ meta: { unread: number } }>(user ? `/notifications?pageSize=1&path=${encodeURIComponent(pathname)}` : null);
  const unread = notes.data?.meta.unread ?? 0;
  const [open, setOpen] = useState(false);
  const [browserOffline, setBrowserOffline] = useState(false);
  const [install, setInstall] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    const sync = () => setBrowserOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    const onPrompt = (event: Event) => {
      if (!window.matchMedia("(max-width: 768px)").matches) return;
      event.preventDefault();
      if (sessionStorage.getItem("kort-install-dismissed") === "1") return;
      setInstall(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-paper text-sm text-muted" role="status">
        Kort hazırlanıyor…
      </div>
    );
  }
  if (!user && !offline) {
    router.replace("/login");
    return null;
  }

  const offlineNow = offline || browserOffline;
  const wide = pathname.startsWith("/kortlar");

  return (
    <div className={`mx-auto min-h-dvh pb-28 ${wide ? "max-w-6xl" : "max-w-lg"}`}>
      <a href="#icerik" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-3 focus:py-2">
        İçeriğe geç
      </a>
      <div className="flex items-center justify-between px-5 pt-4">
        <p className="text-xs font-semibold tracking-[0.22em] text-court-deep uppercase">{brand.name}</p>
        <Link href="/bildirimler" aria-label={unread ? `Bildirimler, ${unread} okunmamış` : "Bildirimler"} className="relative grid h-10 w-10 place-items-center rounded-full bg-surface">
          <Bell className="h-5 w-5" />
          {unread > 0 ? <span className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-clay px-1 text-[10px] font-semibold text-white">{unread > 9 ? "9+" : unread}</span> : null}
        </Link>
      </div>
      {install ? (
        <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-2xl bg-court px-4 py-3 text-sm text-white md:hidden">
          <p>Kort’u ana ekrana ekleyebilirsin.</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="font-semibold"
              onClick={() => {
                void install.prompt();
                setInstall(null);
              }}
            >
              Ekle
            </button>
            <button
              type="button"
              className="text-white/80"
              onClick={() => {
                sessionStorage.setItem("kort-install-dismissed", "1");
                setInstall(null);
              }}
            >
              Kapat
            </button>
          </div>
        </div>
      ) : null}
      {offlineNow ? (
        <p className="mx-4 mt-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm" role="status">
          Çevrimdışısın. Bağlantı gelince veriler yenilenir. Kişisel bilgiler bu cihazda saklanmaz.
        </p>
      ) : null}
      <main id="icerik" className="px-4 pt-2">
        {user ? children : (
          <div className="rounded-3xl border border-line bg-surface px-5 py-8">
            <h1 className="text-2xl font-semibold">Çevrimdışısın</h1>
            <p className="mt-2 text-sm text-muted">Giriş ve alt menü açık. Maçların ve profilin ancak bağlantı varken yüklenir.</p>
            <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-court">Giriş sayfası</Link>
          </div>
        )}
      </main>
      {open ? (
        <div className="fixed right-4 bottom-28 z-50 w-52 rounded-3xl border border-line bg-surface p-2 shadow-xl">
          <Link href="/maclar/yeni" onClick={() => setOpen(false)} className="block rounded-2xl px-3 py-3 text-sm font-semibold hover:bg-paper">
            Yeni maç
          </Link>
          <Link href="/defiler/yeni" onClick={() => setOpen(false)} className="block rounded-2xl px-3 py-3 text-sm font-semibold hover:bg-paper">
            Yeni defi
          </Link>
        </div>
      ) : null}
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Kapat" : "Yeni maç veya defi"}
        onClick={() => setOpen((value) => !value)}
        className="fixed right-4 bottom-24 z-50 grid h-14 w-14 place-items-center rounded-full bg-clay text-white shadow-lg"
      >
        {open ? <X /> : <Plus />}
      </button>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur" aria-label="Ana menü">
        <ul className={`mx-auto grid grid-cols-6 pb-[env(safe-area-inset-bottom)] ${wide ? "max-w-6xl" : "max-w-lg"}`}>
          {items.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-1 py-2 text-[10px] font-medium sm:text-[11px] ${active ? "text-court" : "text-muted"}`}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
