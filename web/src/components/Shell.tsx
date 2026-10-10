import { useEffect, useState } from 'react';
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useMatch,
  useNavigate,
} from 'react-router-dom';
import * as Menu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import {
  BookOpen,
  ChevronDown,
  FolderOpen,
  Library,
  LogOut,
  Menu as MenuIcon,
  Moon,
  PanelLeft,
  Plus,
  Search,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/auth-context';
import { useCases, useChats } from '../lib/queries';
import { api } from '../lib/api';
import { CaseForm } from '../features/cases/CaseForm';
import { Button, ConfirmDialog, ErrorNotice, IconButton, Loading } from './ui';

export function Shell() {
  const auth = useAuth();
  const cases = useCases();
  const match = useMatch('/cases/:caseId/*');
  const caseId = match?.params.caseId;
  const chats = useChats(caseId);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [newCase, setNewCase] = useState(false);
  const [search, setSearch] = useState('');
  const [dark, setDark] = useState(() => {
    try {
      return (
        localStorage.getItem('expertise-theme') === 'dark' ||
        (!localStorage.getItem('expertise-theme') &&
          matchMedia('(prefers-color-scheme: dark)').matches)
      );
    } catch {
      return false;
    }
  });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [logoutAll, setLogoutAll] = useState(false);
  const [logoutError, setLogoutError] = useState<unknown>(null);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const deleteChat = useMutation({
    mutationFn: () => api.deleteChat(deleteId!),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['chats', caseId] });
      cache.removeQueries({ queryKey: ['chat', deleteId] });
      if (location.pathname.endsWith(`/chat/${deleteId}`))
        await navigate(`/cases/${caseId}`);
      setDeleteId(null);
    },
  });
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    try {
      localStorage.setItem('expertise-theme', dark ? 'dark' : 'light');
    } catch {
      /* A theme preference is optional when browser storage is disabled. */
    }
  }, [dark]);
  useEffect(() => {
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [location.pathname]);
  useEffect(() => {
    const desktop = matchMedia('(min-width: 768px)');
    const closeOnResize = () => {
      if (desktop.matches) setMobileOpen(false);
    };
    desktop.addEventListener('change', closeOnResize);
    return () => desktop.removeEventListener('change', closeOnResize);
  }, []);
  async function signOut(everywhere = false) {
    setLogoutBusy(true);
    setLogoutError(null);
    try {
      await auth.signOut(everywhere);
      await navigate('/login', { replace: true });
    } catch (cause) {
      setLogoutError(cause);
    } finally {
      setLogoutBusy(false);
    }
  }
  const closeMobile = () => setMobileOpen(false);
  const records =
    cases.data?.pages
      .flat()
      .filter((record) =>
        `${record.title} ${record.internalReference || ''}`
          .toLocaleLowerCase('it')
          .includes(search.toLocaleLowerCase('it')),
      ) || [];
  const sidebarContent = (
    <>
      <div className="sidebar-top">
        <Link to="/" className="wordmark" onClick={closeMobile}>
          Expertise
          <span className="wordmark-dot" />
        </Link>
        <IconButton
          label="Chiudi la barra laterale"
          className="desktop-only"
          onClick={() => setCollapsed(true)}
        >
          <PanelLeft size={20} />
        </IconButton>
        <IconButton
          label="Chiudi il menu"
          className="mobile-only"
          onClick={closeMobile}
        >
          <X size={20} />
        </IconButton>
      </div>
      <nav className="sidebar-actions">
        <button
          type="button"
          className="nav-item"
          onClick={() => {
            setNewCase(true);
            closeMobile();
          }}
        >
          <Plus size={19} />
          Nuova pratica
        </button>
        <NavLink className="nav-item" to="/library" onClick={closeMobile}>
          <Library size={19} />
          Libreria documenti
        </NavLink>
        <NavLink className="nav-item" to="/guide" onClick={closeMobile}>
          <BookOpen size={19} />
          Come funziona
        </NavLink>
      </nav>
      <div className="sidebar-scroll">
        <div className="sidebar-label">Le tue pratiche</div>
        <label className="sidebar-search">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Cerca nelle pratiche caricate</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca una pratica"
          />
        </label>
        {cases.isPending && <Loading label="Caricamento…" />}
        <ErrorNotice
          error={cases.error}
          retry={() => {
            void cases.refetch();
          }}
        />
        <nav className="case-list">
          {records.map((record) => (
            <NavLink
              key={record.id}
              to={`/cases/${record.id}`}
              className={`case-nav ${record.id === caseId ? 'active' : ''}`}
              onClick={closeMobile}
            >
              <FolderOpen size={16} />
              <span>{record.title}</span>
            </NavLink>
          ))}
        </nav>
        {!cases.isPending && records.length === 0 && (
          <p className="sidebar-empty">
            {search
              ? 'Nessuna pratica caricata corrisponde.'
              : 'Le tue pratiche appariranno qui.'}
          </p>
        )}
        {cases.hasNextPage && (
          <Button
            variant="ghost"
            busy={cases.isFetchingNextPage}
            onClick={() => {
              void cases.fetchNextPage();
            }}
          >
            Carica altre pratiche
          </Button>
        )}
        {caseId && (
          <>
            <div className="sidebar-label conversations-label">
              Conversazioni
            </div>
            <Link
              className="case-nav"
              to={`/cases/${caseId}`}
              onClick={closeMobile}
            >
              <Plus size={15} />
              <span>Nuova conversazione</span>
            </Link>
            <ErrorNotice
              error={chats.error}
              retry={() => {
                void chats.refetch();
              }}
            />
            {chats.data?.pages.flat().map((chat) => (
              <div className="chat-nav-row" key={chat.id}>
                <NavLink
                  to={`/cases/${caseId}/chat/${chat.id}`}
                  className="chat-nav"
                  onClick={closeMobile}
                >
                  {chat.title || 'Conversazione'}
                </NavLink>
                <IconButton
                  label={`Elimina conversazione ${chat.title || ''}`}
                  onClick={() => {
                    deleteChat.reset();
                    setDeleteId(chat.id);
                  }}
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
            ))}
            {chats.hasNextPage && (
              <Button
                variant="ghost"
                busy={chats.isFetchingNextPage}
                onClick={() => {
                  void chats.fetchNextPage();
                }}
              >
                Carica altre conversazioni
              </Button>
            )}
          </>
        )}
      </div>
      <div className="sidebar-account">
        <Menu.Root>
          <Menu.Trigger asChild>
            <button type="button" className="account-button">
              <span className="avatar">
                {auth.user?.email.charAt(0).toUpperCase()}
              </span>
              <span>
                <strong>Il tuo workspace</strong>
                <small>{auth.user?.email}</small>
              </span>
              <ChevronDown size={15} />
            </button>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content
              className="menu-content"
              side="top"
              align="start"
              sideOffset={8}
            >
              <Menu.Item className="menu-item" onSelect={() => setDark(!dark)}>
                {dark ? <Sun size={17} /> : <Moon size={17} />}
                {dark ? 'Tema chiaro' : 'Tema scuro'}
              </Menu.Item>
              <Menu.Separator className="menu-separator" />
              <Menu.Item
                className="menu-item"
                disabled={logoutBusy}
                onSelect={() => {
                  void signOut();
                }}
              >
                <LogOut size={17} />
                Esci
              </Menu.Item>
              <Menu.Item
                className="menu-item"
                onSelect={() => {
                  setLogoutError(null);
                  setLogoutAll(true);
                }}
              >
                <LogOut size={17} />
                Esci da tutte le sessioni
              </Menu.Item>
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
        <ErrorNotice error={logoutError} />
      </div>
    </>
  );
  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <a className="skip-link" href="#main-content">
        Vai al contenuto
      </a>
      <aside
        className="sidebar desktop-sidebar"
        aria-label="Navigazione principale"
      >
        {sidebarContent}
      </aside>
      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="sidebar-backdrop" />
          <Dialog.Content
            className="sidebar sidebar-open"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              document.getElementById('mobile-menu-trigger')?.focus();
            }}
          >
            <Dialog.Title className="sr-only">
              Navigazione principale
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              Pratiche, conversazioni, documenti e account.
            </Dialog.Description>
            {sidebarContent}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <div className="workspace">
        <header className="app-topbar">
          <div className="topbar-left">
            <IconButton
              label="Apri il menu"
              id="mobile-menu-trigger"
              className="mobile-only"
              onClick={() => setMobileOpen(true)}
            >
              <MenuIcon size={20} />
            </IconButton>
            {collapsed && (
              <IconButton
                label="Apri la barra laterale"
                className="desktop-only"
                onClick={() => setCollapsed(false)}
              >
                <PanelLeft size={20} />
              </IconButton>
            )}
            <Link className="workspace-name" to="/">
              Expertise
              <ChevronDown size={15} />
            </Link>
          </div>
          <div className="topbar-right">
            <span className="workspace-caption">Il workspace del perito</span>
            <IconButton
              label={dark ? 'Attiva tema chiaro' : 'Attiva tema scuro'}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </IconButton>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <CaseForm open={newCase} onClose={() => setNewCase(false)} />
      <ConfirmDialog
        open={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        title="Eliminare la conversazione?"
        destructive
        confirmLabel="Elimina conversazione"
        busy={deleteChat.isPending}
        error={deleteChat.error}
        onConfirm={() => deleteChat.mutate()}
      >
        La conversazione sarà rimossa dallo storico. I documenti e i dati della
        pratica restano disponibili.
      </ConfirmDialog>
      <ConfirmDialog
        open={logoutAll}
        onClose={() => setLogoutAll(false)}
        title="Uscire da tutte le sessioni?"
        confirmLabel="Esci da tutte le sessioni"
        busy={logoutBusy}
        error={logoutError}
        onConfirm={() => {
          void signOut(true);
        }}
      >
        Dovrai accedere di nuovo su ciascun dispositivo. I token di accesso già
        emessi scadono entro 15 minuti.
      </ConfirmDialog>
    </div>
  );
}
