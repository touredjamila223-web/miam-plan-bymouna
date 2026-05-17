import { Link, useLocation } from "@tanstack/react-router";
import { Home, BookOpen, Refrigerator, CalendarDays, User, MessageCircle, Sparkles, Heart, ShoppingCart, Layers, History, MoreHorizontal } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useUserStats } from "@/hooks/use-user-stats";

const MOBILE_NAV: { to: string; label: string; icon: any; countKey?: "favorites" | "cooked" }[] = [
  { to: "/", label: "Accueil", icon: Home },
  { to: "/recettes", label: "Recettes", icon: BookOpen },
  { to: "/frigo", label: "Frigo", icon: Refrigerator },
  { to: "/mes-recettes", label: "Favoris", icon: Heart, countKey: "favorites" },
  { to: "/historique", label: "Réalisées", icon: History, countKey: "cooked" },
];

const DESKTOP_NAV: { to: string; label: string; icon: any; countKey?: "favorites" | "cooked" }[] = [
  { to: "/", label: "Accueil", icon: Home },
  { to: "/recettes", label: "Bibliothèque", icon: BookOpen },
  { to: "/generer", label: "Générer", icon: Sparkles },
  { to: "/frigo", label: "Mon frigo", icon: Refrigerator },
  { to: "/planning", label: "Planning", icon: CalendarDays },
  { to: "/courses", label: "Courses", icon: ShoppingCart },
  { to: "/batch", label: "Batch cooking", icon: Layers },
  { to: "/mes-recettes", label: "Favoris", icon: Heart, countKey: "favorites" },
  { to: "/historique", label: "Réalisées", icon: History, countKey: "cooked" },
  { to: "/profil", label: "Profil", icon: User },
];

function CountBadge({ value }: { value: number }) {
  if (!value) return null;
  return (
    <span className="ml-auto bg-primary/15 text-primary text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
      {value > 99 ? "99+" : value}
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const hideOnAuth = location.pathname === "/auth";
  const { data: stats } = useUserStats();
  const counts = { favorites: stats?.favorites ?? 0, cooked: stats?.cooked ?? 0 };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20 md:pb-0 md:pl-60">
      {!loading && !user && !hideOnAuth && (
        <div className="bg-accent text-accent-foreground px-4 py-2 text-sm text-center">
          Mode invité — <Link to="/auth" className="underline font-medium">connectez-vous</Link> pour sauvegarder vos données.
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-60 bg-sidebar border-r border-sidebar-border flex-col p-4">
        <Link to="/" className="text-2xl font-bold text-primary mb-8 px-2" style={{ fontFamily: 'Fraunces, serif' }}>MiamPlan</Link>
        <nav className="flex flex-col gap-1">
          {DESKTOP_NAV.map((n) => (
            <Link key={n.to} to={n.to} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sidebar-accent transition" activeProps={{ className: "bg-sidebar-accent text-sidebar-primary font-medium" }}>
              <n.icon className="w-5 h-5" />
              <span>{n.label}</span>
              {n.countKey && <CountBadge value={counts[n.countKey]} />}
            </Link>
          ))}
          <Link to="/chat" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sidebar-accent transition" activeProps={{ className: "bg-sidebar-accent text-sidebar-primary font-medium" }}>
            <MessageCircle className="w-5 h-5" />Chat IA
          </Link>
        </nav>
      </aside>

      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-sidebar border-t border-sidebar-border flex justify-around py-2 z-40">
        {MOBILE_NAV.map((n) => (
          <Link key={n.to} to={n.to} className="relative flex flex-col items-center gap-1 px-1 py-1 text-[10px] leading-tight" activeProps={{ className: "text-primary" }}>
            <div className="relative">
              <n.icon className="w-5 h-5" />
              {n.countKey && counts[n.countKey] > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-primary text-primary-foreground text-[9px] font-semibold px-1 py-0 rounded-full min-w-[14px] text-center leading-tight">
                  {counts[n.countKey] > 99 ? "99+" : counts[n.countKey]}
                </span>
              )}
            </div>
            {n.label}
          </Link>
        ))}
        <Link to="/profil" className="flex flex-col items-center gap-1 px-1 py-1 text-[10px] leading-tight" activeProps={{ className: "text-primary" }}>
          <MoreHorizontal className="w-5 h-5" />Plus
        </Link>
      </nav>

      {/* Floating chat */}
      <Link to="/chat" className="fixed bottom-24 md:bottom-6 right-6 bg-primary text-primary-foreground rounded-full p-4 shadow-lg hover:scale-105 transition z-30" aria-label="Chat IA">
        <MessageCircle className="w-6 h-6" />
      </Link>
    </div>
  );
}