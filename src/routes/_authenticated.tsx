import { createFileRoute, Navigate, Outlet, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Stethoscope, LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  component: Layout,
});

function Layout() {
  const { session, loading, signOut, profile } = useAuth();
  const nav = useNavigate();
  if (loading) return null;
  if (!session) return <Navigate to="/login" />;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold">
            <div className="bg-primary text-primary-foreground rounded-md p-1.5">
              <Stethoscope className="h-4 w-4" />
            </div>
            MedAtesta
          </Link>
          <div className="flex items-center gap-3">
            {profile && <span className="text-sm text-muted-foreground hidden sm:inline">Dr(a). {profile.nome}</span>}
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => { await signOut(); nav({ to: "/login" }); }}
            >
              <LogOut className="h-4 w-4 mr-1" /> Sair
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
