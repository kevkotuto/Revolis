'use client';

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
    SidebarMenuAction,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
    SidebarGroupLabel,
    useSidebar
  } from "@/components/ui/sidebar"
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { Building2, Home, Users, FolderKanban, CreditCard, Briefcase, Bot, CalendarClock, LogOut, User, CheckSquare, Settings, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { open, state } = useSidebar();
  
  const isPro = pathname.startsWith('/pro');
  const isPerso = pathname.startsWith('/perso');

  // Fonction sécurisée pour la navigation
  const handleNavigation = (path: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (pathname === path) {
      e.preventDefault(); // Éviter de naviguer vers la même page
      return;
    }
  };

  // Fonction sécurisée pour la déconnexion
  const handleSignOut = async () => {
    try {
      await signOut({ callbackUrl: '/' });
    } catch (error) {
      console.error("Erreur lors de la déconnexion:", error);
    }
  };

  return (
    <Sidebar className="border-r border-border h-screen">
      <SidebarHeader className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          {isPro ? (
            <Building2 className="h-6 w-6 text-blue-600" />
          ) : (
            <Home className="h-6 w-6 text-purple-600" />
          )}
          <span className={cn("font-bold text-xl transition-opacity", 
                state === "collapsed" && "opacity-0")}>
            {isPro ? "Revolis Pro" : "Revolis Perso"}
          </span>
        </div>
      </SidebarHeader>
      
      <SidebarContent className="px-2 py-4 overflow-y-auto">
        <SidebarMenu>
          <SidebarMenuItem>
            <Link href="/" legacyBehavior passHref>
              <SidebarMenuButton 
                isActive={pathname === "/"} 
                tooltip={state === "collapsed" ? "Accueil" : undefined}
              >
                <Home className="h-5 w-5 mr-2" />
                <span>Accueil</span>
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Liens de navigation spécifiques à Pro */}
        {isPro && (
          <>
            <SidebarGroupLabel className="mt-6 mb-2 px-2 text-xs font-semibold text-muted-foreground">
              PROFESSIONNEL
            </SidebarGroupLabel>
            <SidebarMenu>
              {[
                { path: '/pro/clients', icon: <Users className="h-5 w-5" />, label: 'Clients' },
                { path: '/pro/projets', icon: <FolderKanban className="h-5 w-5" />, label: 'Projets' },
                { path: '/pro/finance', icon: <CreditCard className="h-5 w-5" />, label: 'Finance' },
                { path: '/pro/prestataires', icon: <Briefcase className="h-5 w-5" />, label: 'Prestataires' },
                { path: '/pro/agents', icon: <Bot className="h-5 w-5" />, label: 'Agents IA' },
                { path: '/pro/abonnements', icon: <CalendarClock className="h-5 w-5" />, label: 'Abonnements' },
              ].map((item) => (
                <SidebarMenuItem key={item.path}>
                  <Link href={item.path} legacyBehavior passHref>
                    <SidebarMenuButton 
                      isActive={pathname === item.path}
                      tooltip={state === "collapsed" ? item.label : undefined}
                    >
                      {item.icon}
                      <span className="ml-2">{item.label}</span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </>
        )}

        {/* Liens de navigation spécifiques à Perso */}
        {isPerso && (
          <>
            <SidebarGroupLabel className="mt-6 mb-2 px-2 text-xs font-semibold text-muted-foreground">
              PERSONNEL
            </SidebarGroupLabel>
            <SidebarMenu>
              {[
                { path: '/perso/projets', icon: <FolderKanban className="h-5 w-5" />, label: 'Mes projets' },
                { path: '/perso/taches', icon: <CheckSquare className="h-5 w-5" />, label: 'Mes tâches' },
              ].map((item) => (
                <SidebarMenuItem key={item.path}>
                  <Link href={item.path} legacyBehavior passHref>
                    <SidebarMenuButton 
                      isActive={pathname === item.path}
                      tooltip={state === "collapsed" ? item.label : undefined}
                    >
                      {item.icon}
                      <span className="ml-2">{item.label}</span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </>
        )}
        
        {/* Section paramètres */}
        <SidebarGroupLabel className="mt-6 mb-2 px-2 text-xs font-semibold text-muted-foreground">
          PARAMÈTRES
        </SidebarGroupLabel>
        <SidebarMenu>
          {[
            { path: '/profil', icon: <User className="h-5 w-5" />, label: 'Mon profil' },
            { path: '/parametres', icon: <Settings className="h-5 w-5" />, label: 'Paramètres' },
          ].map((item) => (
            <SidebarMenuItem key={item.path}>
              <Link href={item.path} legacyBehavior passHref>
                <SidebarMenuButton 
                  isActive={pathname === item.path}
                  tooltip={state === "collapsed" ? item.label : undefined}
                >
                  {item.icon}
                  <span className="ml-2">{item.label}</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-border">
        <div className="flex flex-col space-y-2">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={(session?.user as any)?.avatar} alt={session?.user?.name || 'Avatar'} />
              <AvatarFallback className="bg-secondary text-secondary-foreground">
                {session?.user?.name ? session.user.name.charAt(0).toUpperCase() : 'U'}
              </AvatarFallback>
            </Avatar>
            <div className={cn("flex flex-col text-sm transition-opacity", 
                  state === "collapsed" && "opacity-0")}>
              <span className="font-medium">{session?.user?.name || 'Utilisateur'}</span>
              <span className="text-xs text-muted-foreground">{session?.user?.email}</span>
            </div>
          </div>
          <button 
            onClick={handleSignOut}
            className={cn(
              "w-full flex items-center gap-2 p-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors text-sm",
              state === "collapsed" && "justify-center"
            )}
          >
            <LogOut className="h-4 w-4" />
            <span className={cn(state === "collapsed" && "sr-only")}>Déconnexion</span>
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
  