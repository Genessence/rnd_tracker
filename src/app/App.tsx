import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { StyleguidePage } from '../features/styleguide/StyleguidePage';
import { DebugPage } from '../features/debug/DebugPage';
import { TowerPage } from '../features/tower/TowerPage';
import { TeamPage } from '../features/team/TeamPage';
import { MyDayPage } from '../features/myday/MyDayPage';
import { ProjectsPage } from '../features/project/ProjectsPage';
import { ProjectPage } from '../features/project/ProjectPage';
import { RequestsPage } from '../features/requests/RequestsPage';
import { MeetingsPage } from '../features/meetings/MeetingsPage';
import { MeetingPage } from '../features/meetings/MeetingPage';
import { OutboxPage } from '../features/outbox/OutboxPage';
import { LedgerPage } from '../features/ledger/LedgerPage';
import { useStore } from '../store/store';
import { homeOf } from './personas';
import { Shell } from './Shell';

function Home() {
  const personId = useStore((s) => s.currentPersonId);
  return <Navigate to={homeOf(personId)} replace />;
}

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/styleguide" element={<StyleguidePage />} />
        <Route path="/debug" element={<DebugPage />} />
        <Route element={<Shell />}>
          <Route path="/tower" element={<TowerPage />} />
          <Route path="/team/:teamId" element={<TeamPage />} />
          <Route path="/my-day" element={<MyDayPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectPage />} />
          <Route path="/requests" element={<RequestsPage />} />
          <Route path="/meetings" element={<MeetingsPage />} />
          <Route path="/meetings/:id" element={<MeetingPage />} />
          <Route path="/outbox" element={<OutboxPage />} />
          <Route path="/ledger" element={<LedgerPage />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
